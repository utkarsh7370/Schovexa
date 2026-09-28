'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

// A single modal primitive for the whole app — confirmations and small
// forms go through this instead of each page inventing its own overlay.
// No portal: this project has no dialogs nested inside other scrolling
// containers, so a fixed-position overlay rendered in place is simpler
// than pulling in a portal dependency for no real benefit yet.
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Focus the panel so Escape/Tab work immediately without requiring a
    // click first — the trigger button loses focus once this covers it.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated focus:outline-none"
      >
        <h2 id="dialog-title" className="text-lg font-semibold text-navy">
          {title}
        </h2>
        {description && (
          <p id="dialog-description" className="mt-1.5 text-sm text-slate-500">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
