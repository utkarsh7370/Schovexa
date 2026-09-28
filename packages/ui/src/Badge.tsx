import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

// One shared "status pill" for the whole app — every list (students,
// staff, fees, notices) renders its status through this instead of each
// page picking its own ad hoc colored text, so "what does this color
// mean" stays consistent everywhere a user sees it.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
  brand: 'bg-brand-blue/10 text-brand-blue',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  brand: 'bg-brand-blue',
};

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[tone],
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {dot && <span className={['h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[tone]].join(' ')} aria-hidden="true" />}
      {children}
    </span>
  );
}
