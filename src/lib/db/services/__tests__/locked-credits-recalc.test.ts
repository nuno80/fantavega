// src/lib/db/services/__tests__/locked-credits-recalc.test.ts
// STEP-1/6: verifica che recalcUserLockedCredits calcoli l'esposizione attiva
// (auto-bid attivi + offerte manuali vincenti senza auto-bid) esattamente come
// il blocco duplicato che sostituisce in bid.service.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import { recalcUserLockedCredits } from "../locked-credits.service";

beforeEach(() => {
  mockExecute.mockReset();
});

describe("recalcUserLockedCredits", () => {
  it("somma auto-bid attivi e offerte manuali vincenti senza auto-bid", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ total_locked: 42 }] });

    const total = await recalcUserLockedCredits(1, "user-a", {
      execute: mockExecute,
    });

    expect(total).toBe(42);
    const [call] = mockExecute.mock.calls;
    expect(call[0].args).toEqual([1, "user-a", "user-a", 1, "user-a"]);
    expect(call[0].sql).toContain("SELECT SUM(ab.max_amount)");
    expect(call[0].sql).toContain("ab.id IS NULL");
  });

  it("ritorna 0 quando il risultato è null/undefined (nessuna esposizione)", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const total = await recalcUserLockedCredits(1, "user-a", {
      execute: mockExecute,
    });
    expect(total).toBe(0);
  });

  it("valida leagueId e userId", async () => {
    await expect(
      recalcUserLockedCredits(0, "user-a", { execute: mockExecute }),
    ).rejects.toThrow("positive safe integer");
    await expect(
      recalcUserLockedCredits(1, "", { execute: mockExecute }),
    ).rejects.toThrow("non-empty string");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
