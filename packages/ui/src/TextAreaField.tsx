'use client';

import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { AlertCircleIcon } from './icons';

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
}

// The multi-line sibling of TextField — same label, radius, focus ring and
// error treatment, so a notice body or a holiday note doesn't look like it
// came from a different app than the inputs around it.
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, error, helperText, id, className, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? props.name ?? generatedId;
    const errorId = `${fieldId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-semibold text-navy">
          {label}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-400',
            'transition-all duration-200 focus:outline-none focus:ring-4',
            error
              ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15'
              : 'border-slate-200 hover:border-slate-300 focus:border-brand-blue focus:ring-brand-blue/15',
            className ?? '',
          ].join(' ')}
          {...props}
        />
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
TextAreaField.displayName = 'TextAreaField';
