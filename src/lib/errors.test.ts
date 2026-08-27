import { describe, expect, it } from "vitest";

import { errorResponse, toPublicError } from "@/lib/errors";

describe("toPublicError", () => {
  it("maps known bid.service messages to stable codes", () => {
    expect(toPublicError(new Error("Budget insufficiente. Disponibile: 5 crediti"))).toEqual({
      code: "INSUFFICIENT_BUDGET",
      message: "Budget insufficiente. Disponibile: 5 crediti",
    });
    expect(toPublicError(new Error("Giocatore 42 non trovato."))).toEqual({
      code: "NOT_FOUND",
      message: "Giocatore 42 non trovato.",
    });
    expect(toPublicError(new Error("Esiste già un'asta attiva per il giocatore 42."))).toEqual({
      code: "AUCTION_EXISTS",
      message: "Esiste già un'asta attiva per il giocatore 42.",
    });
    expect(toPublicError(new Error("Sei già il miglior offerente."))).toEqual({
      code: "ALREADY_HIGHEST_BIDDER",
      message: "Sei già il miglior offerente.",
    });
  });

  it("collapses unknown errors to a generic 500", () => {
    expect(toPublicError(new Error("upstream exploded: connection reset"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "Si è verificato un errore inatteso. Riprova.",
    });
  });
});

describe("errorResponse", () => {
  it("never leaks the upstream message to the client on unknown errors", async () => {
    const res = errorResponse(new Error("secret: connection refused to turso"), "test");
    const body = await res.json();
    expect(body).toEqual({
      error: "Si è verificato un errore inatteso. Riprova.",
      code: "INTERNAL_ERROR",
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });

  it("returns the client-safe message and code for known errors", async () => {
    const res = errorResponse(new Error("Budget insufficiente. Disponibile: 5 crediti"), "test");
    const body = await res.json();
    expect(body).toEqual({
      error: "Budget insufficiente. Disponibile: 5 crediti",
      code: "INSUFFICIENT_BUDGET",
    });
    expect(res.status).toBe(400);
  });
});
