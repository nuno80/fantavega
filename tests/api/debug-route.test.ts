import { describe, expect, it } from "vitest";

import { isDebugApiEnabled } from "@/lib/auth/debug-route";

describe("debug route policy", () => {
  it("disables debug APIs in production unless explicitly enabled", () => {
    expect(isDebugApiEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isDebugApiEnabled({ NODE_ENV: "production", ENABLE_DEBUG_API: "true" })).toBe(true);
    expect(isDebugApiEnabled({ NODE_ENV: "development" })).toBe(true);
  });
});
