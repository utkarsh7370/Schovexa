import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  /** Blinking, pinging dot — for "look at this" states like unread notices. */
  pulse?: boolean;
}

// One shared "status pill" for the whole app — every list (students,
// staff, fees, notices) renders its status through this instead of each
// page picking its own ad hoc colored text, so "what does this color
// mean" stays consistent everywhere a user sees it.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  brand: 'bg-brand-blue',
};

export function Badge({ tone = 'neutral', dot = false, pulse = false, className, children, ...props }: BadgeProps) {
  const showDot = dot || pulse;
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONE_CLASSES[tone],
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {showDot && (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {pulse && (
            <span className={['absolute inline-flex h-full w-full animate-ping-soft rounded-full', DOT_CLASSES[tone]].join(' ')} />
          )}
          <span className={['relative inline-flex h-2 w-2 rounded-full', DOT_CLASSES[tone]].join(' ')} />
        </span>
      )}
      {children}
    </span>
  );
}
