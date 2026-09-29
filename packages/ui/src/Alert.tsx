import type { ReactNode } from 'react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from './icons';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

// Semantic colors per docs/architecture.md §11 (Success/Warning/Error/
// Info) — functional colors, distinct from the brand palette. Text is
// always paired with the color AND an icon (never color alone conveys
// meaning, docs/frontend-architecture.md §7).
const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-sky-50 text-sky-900 border-sky-200',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  error: 'bg-red-50 text-red-900 border-red-200',
};

const ICON_CLASSES: Record<AlertVariant, string> = {
  info: 'text-sky-500',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
};

const ICONS = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  error: AlertCircleIcon,
};

export function Alert({ variant = 'info', children, className }: AlertProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={[
        'flex animate-fade-in items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        VARIANT_CLASSES[variant],
        className ?? '',
      ].join(' ')}
    >
      <Icon size={18} className={['mt-0.5 shrink-0', ICON_CLASSES[variant]].join(' ')} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
