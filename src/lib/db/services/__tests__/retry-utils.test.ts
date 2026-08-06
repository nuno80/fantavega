// src/lib/db/services/__tests__/retry-utils.test.ts
// Suite per withRetry() (issue 11): backoff esponenziale, limite massimo,
// log finale. Usa fake timer per non rallentare i test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withRetry } from "../retry-utils";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("risolve al primo tentativo se la funzione non fallisce", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const promise = withRetry(fn, { maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ritenta con backoff esponenziale fino al successo", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("ok");
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });

    // 1° tentativo fallisce -> sleep(100)
    await vi.advanceTimersByTimeAsync(100);
    // 2° tentativo fallisce -> sleep(200)
    await vi.advanceTimersByTimeAsync(200);
    // 3° tentativo risolve
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("capisce i delay al maxDelayMs", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const promise = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 150,
    });
    // aggancia il gestore prima che il timer avanzi (evita unhandled rejection)
    const assertion = expect(promise).rejects.toThrow("boom");

    // backoff: 100, 200->150, 400->150, 800->150
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(0);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(5);
    expect(logSpy).toHaveBeenCalledWith(
      "[RETRY] Operazione fallita dopo 5 tentativi:",
      expect.any(Error)
    );
    logSpy.mockRestore();
  });

  it("rilancia l'ultimo errore dopo il limite massimo", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("last"));
    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 });
    const assertion = expect(promise).rejects.toThrow("last");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
