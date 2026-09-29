'use client';

import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { AlertCircleIcon, ChevronDownIcon } from './icons';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Omit for compact toolbar filters — pass `aria-label` instead. */
  label?: string;
  error?: string;
  helperText?: string;
  /** Decorative icon inside the select, on the left. */
  leftIcon?: ReactNode;
  /** `sm` is the compact size used in filter bars. */
  fieldSize?: 'md' | 'sm';
}

// The native <select> (so keyboard, mobile pickers and screen readers all
// keep working) dressed to match TextField: same height, radius, focus
// ring and error treatment, plus a chevron. Replaces the hand-styled
// raw <select> each form used to carry its own copy of.
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, helperText, leftIcon, fieldSize = 'md', id, className, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? props.name ?? generatedId;
    const errorId = `${selectId}-error`;
    const compact = fieldSize === 'sm';

    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-semibold text-navy">
            {label}
          </label>
        )}
        <div className="group relative">
          {leftIcon && (
            <span
              className={[
                'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors',
                error ? 'text-red-400' : 'text-slate-400 group-focus-within:text-brand-blue',
              ].join(' ')}
            >
              {leftIcon}
            </span>
          )}
          <select
            ref={ref}
            id={selectId}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
            className={[
              'w-full min-w-0 cursor-pointer appearance-none truncate rounded-xl border bg-white pr-10 text-sm text-slate-900',
              'transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
              compact ? 'h-10' : 'h-11',
              leftIcon ? 'pl-11' : 'pl-3.5',
              error
                ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15'
                : 'border-slate-200 hover:border-slate-300 focus:border-brand-blue focus:ring-brand-blue/15',
              className ?? '',
            ].join(' ')}
            {...props}
          >
            {children}
          </select>
          <ChevronDownIcon
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-blue"
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="flex animate-fade-in items-start gap-1.5 text-sm font-medium text-red-600">
            <AlertCircleIcon size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {!error && helperText && <p className="text-sm text-slate-500">{helperText}</p>}
      </div>
    );
  },
);
SelectField.displayName = 'SelectField';
