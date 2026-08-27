// src/lib/errors.ts
// Single contract for public API errors: a stable `code` plus a client-safe
// `message`. Internal detail (upstream messages, stacks) stays server-side.
// ponytail: maps service Error messages by substring, since bid.service throws
// plain `Error`s with user-facing Italian text. Replacing every throw with a
// typed error is a bigger refactor; add only if a client needs the `code`.
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export interface PublicError {
  code: string;
  message: string;
}

interface ApiErrorRule {
  code: string;
  status: number;
  match: (message: string) => boolean;
}

const GENERIC_500: PublicError = {
  code: "INTERNAL_ERROR",
  message: "Si è verificato un errore inatteso. Riprova.",
};

const RULES: ApiErrorRule[] = [
  {
    code: "INVALID_JSON",
    status: 400,
    match: (m) => m.toLowerCase().includes("json"),
  },
  {
    code: "NOT_FOUND",
    status: 404,
    match: (m) =>
      m.includes("not found") ||
      m.includes("non trovato") ||
      m.includes("non trovata") ||
      m.includes("non trovati"),
  },
  {
    code: "AUCTION_EXISTS",
    status: 409,
    match: (m) =>
      m.includes("active auction already exists") ||
      m.includes("asta attiva per questo giocatore") ||
      m.includes("Esiste già un'asta attiva"),
  },
  {
    code: "AUCTION_NOT_BIDDABLE",
    status: 400,
    match: (m) =>
      m.includes("non sono attualmente attive") ||
      m.includes("Bidding is not currently active") ||
      m.includes("Auction is not active or closing") ||
      m.includes("asta non trovata o non più attiva"),
  },
  {
    code: "PLAYER_ALREADY_ASSIGNED",
    status: 400,
    match: (m) => m.includes("has already been assigned"),
  },
  {
    code: "BID_TOO_LOW",
    status: 400,
    match: (m) =>
      m.includes("must be > current bid") ||
      m.includes("deve essere superiore all'offerta attuale") ||
      m.includes("is less than the minimum bid"),
  },
  {
    code: "ALREADY_HIGHEST_BIDDER",
    status: 400,
    match: (m) =>
      m.includes("is already the highest bidder") ||
      m.includes("Sei già il miglior offerente"),
  },
  {
    code: "INSUFFICIENT_BUDGET",
    status: 400,
    match: (m) =>
      m.includes("Insufficient budget") ||
      m.startsWith("Insufficient available budget") ||
      m.includes("Budget insufficiente"),
  },
  {
    code: "SLOTS_FULL",
    status: 400,
    match: (m) => m.startsWith("Slot full, you cannot bid"),
  },
  {
    code: "NOT_PARTICIPANT",
    status: 400,
    match: (m) =>
      m.includes("is not a participant") || m.includes("non fai parte di questa lega"),
  },
  {
    code: "NOT_AUTHORIZED",
    status: 403,
    match: (m) =>
      m.includes("is not a manager") ||
      m.includes("non sei autorizzato a gestire questa squadra"),
  },
  {
    code: "AUCTION_COOLDOWN",
    status: 400,
    match: (m) =>
      m.includes("Hai abbandonato l'asta") ||
      m.includes("Riprova tra") ||
      m.includes("cooldown"),
  },
];

/**
 * Maps a caught error to a client-safe error code + message, matching the
 * substring rules above. Unknown errors collapse to a generic 500.
 */
export function toPublicError(error: unknown): PublicError {
  const message =
    error instanceof Error ? error.message : "Unknown error";

  for (const rule of RULES) {
    if (rule.match(message)) {
      return { code: rule.code, message };
    }
  }
  return GENERIC_500;
}

/**
 * Logs the full error server-side (with redaction) and returns a JSON response
 * containing only the public contract. The internal error is never serialized
 * to the client.
 */
export function errorResponse(
  error: unknown,
  scope: string,
  context?: Record<string, unknown>,
): NextResponse {
  const publicError = toPublicError(error);
  const status = statusForCode(publicError.code);
  logger.error(`[${scope}] request failed`, {
    scope,
    publicCode: publicError.code,
    error: error instanceof Error ? error : { message: String(error) },
    ...context,
  });

  return NextResponse.json(
    { error: publicError.message, code: publicError.code },
    { status },
  );
}

function statusForCode(code: string): number {
  const rule = RULES.find((r) => r.code === code);
  return rule?.status ?? 500;
}
