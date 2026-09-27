import type { ReactNode } from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

// Semantic colors per docs/architecture.md §11 (Success/Warning/Error/
// Info) — functional colors, distinct from the brand palette. Text is
// always paired with the color (never color alone conveys meaning,
// docs/frontend-architecture.md §7).
const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export function Alert({ variant = 'info', children, className }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={['rounded-lg border px-4 py-3 text-sm', VARIANT_CLASSES[variant], className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}
