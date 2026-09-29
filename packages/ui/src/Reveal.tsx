'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms, so a row of cards enters one after another. */
  delay?: number;
  className?: string;
}

// Fades + slides its children up the first time they scroll into view.
// If IntersectionObserver isn't available (old browsers, some test
// environments) the content just shows immediately — never hidden.
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={[visible ? 'animate-fade-in-up' : 'opacity-0', className ?? ''].join(' ')}
      style={visible ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
