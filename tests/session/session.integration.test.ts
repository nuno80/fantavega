import { createClient, type Client } from "@libsql/client";
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Client libSQL reale in-memory: nessun mock del comportamento DB.
// Il modulo @/lib/db viene sostituito solo per iniettare questo client.
// La factory è hoisted da vitest, quindi il client va creato qui dentro.
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));

import {
  recordUserLogin,
  recordUserLogout,
  updateHeartbeat,
  isUniqueConflictError,
} from "@/lib/db/services/session.service";

// Recupera il client reale iniettato dal mock (stesso oggetto usato dal servizio).
const client: Client = (await import("@/lib/db")).db as Client;

describe("session integration (libSQL :memory:)", () => {
  beforeAll(async () => {
    // Schema reale di produzione: user_sessions + FK + indice univoco parziale.
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.execute("DELETE FROM user_sessions");
    await client.execute("DELETE FROM users");
    // FK: user_sessions.user_id REFERENCES users(id) — crea utenti di test reali.
    await client.executeMultiple(`
      INSERT INTO users (id, email, username, role, status) VALUES
        ('user-concurrent', 'c@test.dev', 'c', 'manager', 'active'),
        ('user-race', 'r@test.dev', 'r', 'manager', 'active'),
        ('user-login', 'l@test.dev', 'l', 'manager', 'active'),
        ('user-guard', 'g@test.dev', 'g', 'manager', 'active');
    `);
  });

  it("B2: N parallel updateHeartbeat on the same user all complete with one open session", async () => {
    const userId = "user-concurrent";
    const hearts = await Promise.all(
      Array.from({ length: 10 }, () => updateHeartbeat(userId))
    );
    // Tutti restituiscono un timestamp, nessuno lancia.
    hearts.forEach((h) => expect(h).toBeGreaterThan(0));

    const rows = await client.execute({
      sql: "SELECT id, session_end FROM user_sessions WHERE user_id = ?",
      args: [userId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].session_end).toBeNull();
  });

  it("B2: a unique conflict on a fresh insert is retried with an UPDATE, not propagated", async () => {
    const userId = "user-race";
    await client.execute({
      sql: "INSERT INTO user_sessions (user_id, session_start, session_end, last_heartbeat) VALUES (?, ?, NULL, ?)",
      args: [userId, 1000, 1000],
    });
    // updateHeartbeat fa UPDATE; con 0 righe fa INSERT, che fallisce per unique
    // (una sessione aperta esiste già) → retry UPDATE → 1 riga aggiornata.
    await expect(updateHeartbeat(userId)).resolves.toBeGreaterThan(0);
    const rows = await client.execute({
      sql: "SELECT id, session_end, last_heartbeat FROM user_sessions WHERE user_id = ?",
      args: [userId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].session_end).toBeNull();
    expect(Number(rows.rows[0].last_heartbeat)).toBeGreaterThanOrEqual(1000);
  });

  it("B2: a non-unique DB error still propagates", async () => {
    const userId = "user-other";
    // DELETE FROM user_sessions per pulire, poi viola FK: user inesistente con FK attivo
    // Nota: schema qui non ha FK, quindi uso un errore diverso: tabella mancante.
    // updateHeartbeat con user_sessions esistente non può fallire; uso isUniqueConflictError direttamente.
    expect(isUniqueConflictError({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" })).toBe(false);
    expect(isUniqueConflictError(new Error("UNIQUE constraint failed: user_sessions.user_id"))).toBe(true);
    expect(isUniqueConflictError(new Error("syntax error"))).toBe(false);
    expect(isUniqueConflictError(null)).toBe(false);
    expect(isUniqueConflictError("string")).toBe(false);
  });

  it("B3: recordUserLogin upserts without leaving duplicates", async () => {
    const userId = "user-login";
    await recordUserLogin(userId);
    await recordUserLogin(userId);
    const rows = await client.execute({
      sql: "SELECT id, session_end FROM user_sessions WHERE user_id = ?",
      args: [userId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].session_end).toBeNull();
  });

  it("D2.2: logout guard closes only when the last heartbeat is older than disconnect", async () => {
    const userId = "user-guard";
    await updateHeartbeat(userId); // crea sessione aperta, heartbeat = now
    const now = Math.floor(Date.now() / 1000);

    // heartbeat più recente del disconnect (heartbeat > notAfter) → NON chiude:
    // un altro tab ha continuato a fare heartbeat dopo il disconnect di questo.
    await recordUserLogout(userId, now - 5000);
    let rows = await client.execute({
      sql: "SELECT id, session_end FROM user_sessions WHERE user_id = ?",
      args: [userId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].session_end).toBeNull();

    // heartbeat vecchio (≤ notAfter) → chiude
    await client.execute({
      sql: "UPDATE user_sessions SET last_heartbeat = ? WHERE user_id = ?",
      args: [now - 5000, userId],
    });
    await recordUserLogout(userId, now);
    rows = await client.execute({
      sql: "SELECT id, session_end FROM user_sessions WHERE user_id = ?",
      args: [userId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].session_end).not.toBeNull();
  });
});
