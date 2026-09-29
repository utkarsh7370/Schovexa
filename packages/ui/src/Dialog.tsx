'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { XIcon } from './icons';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Width of the panel. Default 'md'. */
  size?: 'md' | 'lg';
  /** Small content rendered above the title (e.g. badges). */
  eyebrow?: ReactNode;
}

const EXIT_MS = 180;

// A single modal primitive for the whole app — confirmations and small
// forms go through this instead of each page inventing its own overlay.
// It animates in (fade backdrop + scale/slide panel) and out, locks page
// scroll while open, closes on Escape / backdrop click / the X button,
// and returns focus to whatever opened it.
// No portal: this project has no dialogs nested inside other scrolling
// containers, so a fixed-position overlay rendered in place is simpler
// than pulling in a portal dependency for no real benefit yet.
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', eyebrow }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // `mounted` outlives `open` by EXIT_MS so the closing animation can play.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      openerRef.current?.focus?.();
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel so Escape/Tab work immediately without requiring a
    // click first — the trigger button loses focus once this covers it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={[
          'fixed inset-0 bg-navy/50 backdrop-blur-sm transition-opacity duration-200',
          closing ? 'opacity-0' : 'animate-fade-in',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        tabIndex={-1}
        className={[
          'relative z-10 w-full overflow-hidden rounded-3xl bg-white shadow-elevated focus:outline-none',
          size === 'lg' ? 'max-w-xl' : 'max-w-md',
          closing ? 'animate-scale-out' : 'animate-scale-in',
        ].join(' ')}
      >
        <div className="h-1.5 bg-brand-gradient" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-5 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
          aria-label="Close dialog"
        >
          <XIcon size={18} />
        </button>
        <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-7">
          {eyebrow && <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">{eyebrow}</div>}
          <h2 id="dialog-title" className="pr-8 text-xl font-bold tracking-tight text-navy">
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
    </div>
  );
}
