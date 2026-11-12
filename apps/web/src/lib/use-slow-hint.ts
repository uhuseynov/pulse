"use client";

import { useEffect, useState } from "react";

/**
 * True once `pending` has lasted longer than `delayMs`. The hosted API sleeps
 * when idle, so the first request can take a while; this lets the UI say so.
 */
export function useSlowHint(pending: boolean, delayMs = 4000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending, delayMs]);

  return pending && slow;
}

export const SLOW_HINT =
  "Waking up the server. The first request can take up to a minute.";
