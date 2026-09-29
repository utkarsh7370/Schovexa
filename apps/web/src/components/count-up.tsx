'use client';

import { useEffect, useRef, useState } from 'react';

export interface CountUpProps {
  value: number;
  /** Turns the animated number into display text (e.g. currency). */
  format?: (n: number) => string;
  durationMs?: number;
}

// Counts from 0 up to `value` with an ease-out curve — makes a KPI feel
// alive when the dashboard loads. Skips the animation entirely for users
// who prefer reduced motion.
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), durationMs = 900 }: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const from = previous.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className="tabular-nums">{format(display)}</span>;
}
