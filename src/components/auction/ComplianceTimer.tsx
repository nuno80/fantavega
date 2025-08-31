"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

interface ComplianceTimerProps {
  timerStartTimestamp: number | null;
  leagueId?: number;
  onPenaltyApplied?: () => void; // Callback to refresh data after penalty
}

const GRACE_PERIOD_SECONDS = 3600; // 1 hour
const PENALTY_INTERVAL_SECONDS = 3600; // 1 hour between penalties

export function ComplianceTimer({
  timerStartTimestamp,
  leagueId,
  onPenaltyApplied,
}: ComplianceTimerProps) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const lastPenaltyCheckRef = useRef<number | null>(null);
  const isProcessingPenalty = useRef(false);

  // Function to check compliance and conditionally apply penalty when timer expires
  const checkAndApplyPenaltyOnExpiration = useCallback(async () => {
    if (!leagueId || isProcessingPenalty.current) {
      console.warn(
        "[COMPLIANCE_TIMER] No leagueId provided or already processing penalty"
      );
      return;
    }

    try {
      isProcessingPenalty.current = true;
      console.log(
        "[COMPLIANCE_TIMER] Timer expired - checking compliance and applying penalty if needed"
      );

      const response = await fetch(
        `/api/leagues/${leagueId}/check-compliance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("[COMPLIANCE_TIMER] Compliance check completed:", result);

        // Only show notification and refresh if penalty was actually applied
        if (result.appliedPenaltyAmount > 0) {
          toast.error(
            `Penalità applicata: ${result.appliedPenaltyAmount} crediti`,
            {
              description:
                "Il timer di compliance è scaduto e la rosa non è compliant.",
              duration: 8000,
            }
          );

          // Notify parent component to refresh data
          if (onPenaltyApplied) {
            onPenaltyApplied();
          }
        } else if (result.isNowCompliant) {
          console.log(
            "[COMPLIANCE_TIMER] Timer expired but user is now compliant - no penalty applied"
          );
        } else {
          console.log(
            "[COMPLIANCE_TIMER] Timer expired but penalty not applied (may be in grace period or max penalties reached)"
          );
        }
      } else {
        console.error(
          "[COMPLIANCE_TIMER] Failed to check compliance:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "[COMPLIANCE_TIMER] Error checking compliance on timer expiration:",
        error
      );
    } finally {
      isProcessingPenalty.current = false;
    }
  }, [leagueId, onPenaltyApplied]);

  useEffect(() => {
    if (
      timerStartTimestamp === null ||
      isNaN(timerStartTimestamp) ||
      timerStartTimestamp <= 0
    ) {
      setTimeLeft("");
      // Reset state when timer is cleared
      lastPenaltyCheckRef.current = null;
      setIsExpired(false);
      return;
    }

    const calculateTimeLeft = () => {
      const now = Math.floor(Date.now() / 1000);
      const gracePeriodEnd = timerStartTimestamp + GRACE_PERIOD_SECONDS;

      // If we're still in the initial grace period
      if (now < gracePeriodEnd) {
        const remainingSeconds = gracePeriodEnd - now;
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;

        // Validate values to prevent NaN display
        if (isNaN(minutes) || isNaN(seconds)) {
          setTimeLeft("--:--");
          return;
        }

        setTimeLeft(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );
        return;
      }

      // Grace period has ended - calculate time until next penalty
      // Timer now shows countdown to next hourly penalty
      const hoursSinceGracePeriod = Math.floor(
        (now - gracePeriodEnd) / PENALTY_INTERVAL_SECONDS
      );
      const nextPenaltyTime =
        gracePeriodEnd + (hoursSinceGracePeriod + 1) * PENALTY_INTERVAL_SECONDS;
      const remainingSeconds = Math.max(0, nextPenaltyTime - now);

      if (remainingSeconds === 0) {
        // Timer has expired - check compliance and apply penalty if needed
        const currentPenaltyCycle =
          gracePeriodEnd +
          (hoursSinceGracePeriod + 1) * PENALTY_INTERVAL_SECONDS;

        if (lastPenaltyCheckRef.current !== currentPenaltyCycle) {
          lastPenaltyCheckRef.current = currentPenaltyCycle;
          console.log(
            "[COMPLIANCE_TIMER] Timer reached 00:00 - triggering compliance check"
          );

          // Check compliance and apply penalty if appropriate
          checkAndApplyPenaltyOnExpiration();
        }

        setTimeLeft("00:00");
        setIsExpired(true);
        return;
      }

      // Reset expired state if we have time remaining
      if (isExpired && remainingSeconds > 0) {
        setIsExpired(false);
      }

      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;

      // Validate values to prevent NaN display
      if (isNaN(minutes) || isNaN(seconds)) {
        setTimeLeft("--:--");
        return;
      }

      setTimeLeft(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    // Calculate immediately on mount
    calculateTimeLeft();

    // Then update every second
    const intervalId = setInterval(calculateTimeLeft, 1000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [timerStartTimestamp, checkAndApplyPenaltyOnExpiration, isExpired]);

  if (!timeLeft) {
    return null;
  }

  // Different styling for expired vs active timer
  const timerClasses = isExpired
    ? "text-xs font-mono text-red-500 animate-pulse"
    : "text-xs font-mono text-yellow-500";

  return (
    <span
      className={timerClasses}
      title={
        isExpired
          ? "Timer scaduto - controllo compliance in corso"
          : "Tempo rimanente per compliance"
      }
    >
      {timeLeft}
    </span>
  );
}
