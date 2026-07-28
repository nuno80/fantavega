// src/lib/db/services/response-timer-status.ts
// Single source of truth for user_auction_response_timers.status.
// Must stay in sync with the CHECK constraint in database/schema.sql.

export const RESPONSE_TIMER_STATUSES = [
  "pending",
  "cancelled",
  "abandoned",
  "expired",
] as const;

export type ResponseTimerStatus = (typeof RESPONSE_TIMER_STATUSES)[number];
