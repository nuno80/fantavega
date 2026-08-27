// src/lib/logger.ts
// Structured JSON logger with PII redaction and per-request correlation IDs.
// ponytail: no external logger dep — JSON lines on stdout/stderr are enough for
// any aggregator (Railway/Vercel). Swap for pino only if structured sinks or
// child-logger perf becomes a real need.
import { AsyncLocalStorage } from "node:async_hooks";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): Level {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVEL_ORDER) return configured as Level;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const MIN_LEVEL: Level = resolveMinLevel();

const correlationStore = new AsyncLocalStorage<{ correlationId: string }>();

// --- Redaction ------------------------------------------------------------

// Keys whose values are always redacted, regardless of nesting.
const SENSITIVE_KEY_PARTS = [
  "password",
  "secret",
  "token",
  "authorization",
  "api-key",
  "api_key",
  "apikey",
  "cookie",
  "credentials",
  "x-emit-secret",
];

const EMAIL_RE = /([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi;
// Clerk keys start with sk_/pk_, JWTs with eyJ, auth headers with Bearer.
const SECRET_PREFIX_RE = /^(sk_|pk_|eyJ[A-Za-z0-9_-]{5,}|Bearer\s)/;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
}

function redactString(value: string): string {
  let out = value.replace(EMAIL_RE, (_match, local: string, domain: string) => {
    return `${local.slice(0, 1)}***@${domain}`;
  });
  if (SECRET_PREFIX_RE.test(out)) return "[REDACTED]";
  return out;
}

/**
 * Recursively redacts PII/secrets from an arbitrary value before it is logged.
 * Exported for the sentinel tests.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      code: (value as { code?: unknown }).code,
      // Stack is kept server-side only; it never reaches a client response.
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(val, depth + 1);
    }
    return out;
  }
  return value;
}

// --- Logger ---------------------------------------------------------------

type LogContext = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogContext): void;
  info(msg: string, fields?: LogContext): void;
  warn(msg: string, fields?: LogContext): void;
  error(msg: string, fields?: LogContext): void;
  child(context: LogContext): Logger;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[UNSERIALIZABLE]';
  }
}

function createLogger(base: LogContext = {}): Logger {
  function log(level: Level, msg: string, fields?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...(fields ?? {}),
    };
    const store = correlationStore.getStore();
    if (store) record.correlationId = store.correlationId;

    const line = safeStringify(redact(record));
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  }

  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger: Logger = createLogger();

/**
 * Runs `fn` with a correlation ID attached to every log emitted inside it.
 * Spreads automatically across awaits (AsyncLocalStorage), so no threading needed.
 */
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return correlationStore.run({ correlationId }, () => fn());
}
