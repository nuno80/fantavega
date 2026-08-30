// src/components/auction/ResponseTimerIndicator.test.tsx
// Contratto del ResponseTimerIndicator: selezione timer più vicino, tick
// clock-based, colori, pulse sotto 5 minuti, scadenza una sola volta,
// cleanup dell'interval all'unmount.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResponseTimerIndicator, formatTimer } from "./ResponseTimerIndicator";

const tick = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

describe("formatTimer", () => {
  it("formatta 3600 -> 60:00 e decrementa", () => {
    expect(formatTimer(3600)).toBe("60:00");
    expect(formatTimer(3599)).toBe("59:59");
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(-5)).toBe("00:00"); // mai negativo
  });
});

describe("ResponseTimerIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const makeTimer = (deadline: number, name = "Bakoune") => ({
    auctionId: 1,
    playerId: 10,
    playerName: name,
    deadline,
  });

  it("deadline = now + 3600 mostra 60:00, poi 59:59 dopo un secondo", () => {
    const now = Math.floor(Date.now() / 1000);
    render(
      <ResponseTimerIndicator timers={[makeTimer(now + 3600)]} />
    );
    expect(screen.getByText("60:00")).toBeDefined();

    tick();
    expect(screen.getByText("59:59")).toBeDefined();
  });

  it("usa il timer più urgente e mostra il badge +N", () => {
    const now = Math.floor(Date.now() / 1000);
    render(
      <ResponseTimerIndicator
        timers={[
          makeTimer(now + 3600, "Bisseck"),
          makeTimer(now + 1080, "Bakoune"), // più urgente: 18:00
          makeTimer(now + 1800, "Butez"),
        ]}
      />
    );
    expect(screen.getByText("18:00")).toBeDefined();
    expect(screen.getByText("+2")).toBeDefined();
  });

  it("è verde da attivo e con pulse sotto i 5 minuti", () => {
    const now = Math.floor(Date.now() / 1000);

    const { container: activeContainer } = render(
      <ResponseTimerIndicator timers={[makeTimer(now + 3600)]} />
    );
    const activeSpan = activeContainer.querySelector("span");
    expect(activeSpan!.className).toContain("text-emerald-400");
    expect(activeSpan!.className).not.toContain("animate-pulse");
    cleanup();

    const { container: lowContainer } = render(
      <ResponseTimerIndicator timers={[makeTimer(now + 300)]} />
    );
    const lowSpan = lowContainer.querySelector("span");
    expect(lowSpan!.className).toContain("text-emerald-400");
    expect(lowSpan!.className).toContain("animate-pulse");
  });

  it("a zero mostra 00:00 in rosso", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<ResponseTimerIndicator timers={[makeTimer(now - 1)]} />);
    expect(screen.getByText("00:00")).toBeDefined();
    const span = screen.getByTitle(/Bakoune/) as HTMLElement;
    expect(span.className).toContain("text-red-500");
  });

  it("chiama onExpired una sola volta alla scadenza", () => {
    const onExpired = vi.fn();
    const now = Math.floor(Date.now() / 1000);
    render(
      <ResponseTimerIndicator timers={[makeTimer(now + 2)]} onExpired={onExpired} />
    );

    tick(); // 1s rimanente
    expect(onExpired).not.toHaveBeenCalled();

    tick(); // scaduto
    expect(onExpired).toHaveBeenCalledTimes(1);

    tick(); // nessun nuovo callback
    tick();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("elimina l'interval all'unmount", () => {
    const now = Math.floor(Date.now() / 1000);
    const { unmount } = render(
      <ResponseTimerIndicator timers={[makeTimer(now + 3600)]} />
    );

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
