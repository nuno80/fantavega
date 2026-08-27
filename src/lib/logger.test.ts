import { describe, expect, it } from "vitest";

import { redact } from "@/lib/logger";

describe("redact", () => {
  it("redacts emails in strings and nested objects", () => {
    expect(redact("contact mario.rossi@gmail.com now")).toBe(
      "contact m***@gmail.com now",
    );
    expect(redact({ user: { email: "anna.bianchi@example.com" } })).toEqual({
      user: { email: "a***@example.com" },
    });
  });

  it("redacts values under sensitive keys regardless of nesting", () => {
    const payload = {
      headers: { authorization: "Bearer tok_abc123", "x-emit-secret": "s3cr3t" },
      nested: { token: "secret-value", api_key: "key-123" },
    };
    expect(redact(payload)).toEqual({
      headers: { authorization: "[REDACTED]", "x-emit-secret": "[REDACTED]" },
      nested: { token: "[REDACTED]", api_key: "[REDACTED]" },
    });
  });

  it("redacts clerk keys and JWTs by prefix", () => {
    expect(redact("sk_test_abcdef")).toBe("[REDACTED]");
    expect(redact("pk_test_abcdef")).toBe("[REDACTED]");
    expect(redact("eyJhbGciOiJIUzI1NiJ9.payload.signature")).toBe("[REDACTED]");
    expect(redact("Bearer abc.def.ghi")).toBe("[REDACTED]");
  });

  it("keeps the stack on Error objects (server-side only) but redacts its message", () => {
    const err = new Error("mail rossi.verdi@example.com failed");
    const out = redact(err) as { message: string; stack?: string };
    expect(out.message).toBe("mail r***@example.com failed");
    expect(out.stack).toContain("Error");
  });
});
