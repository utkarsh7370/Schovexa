'use client';

import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from './icons';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  /** Decorative icon shown inside the input, on the left. */
  leftIcon?: ReactNode;
}

// Label + input + error, always together — docs/frontend-architecture.md
// §7: "forms use semantic labels, not placeholder-only fields." Every
// screen's form fields go through this one component rather than each
// page hand-rolling label/error markup. Password fields get a built-in
// show/hide toggle so users can check what they typed.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, helperText, leftIcon, id, className, type, ...props }, ref) => {
    const generatedId = useId();
    // Defaults to the field's `name` (what react-hook-form's register()
    // spread actually sets) rather than a random id — every input ends
    // up addressable by its own field name, which both scripted tests
    // and simple CSS targeting rely on, not just label association.
    const inputId = id ?? props.name ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === 'password';

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-semibold text-navy">
          {label}
        </label>
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
          <input
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? 'text' : type}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={[
              'h-11 w-full rounded-xl border bg-white text-sm text-slate-900 placeholder:text-slate-400',
              'transition-all duration-200 focus:outline-none focus:ring-4',
              leftIcon ? 'pl-11' : 'pl-3.5',
              isPassword ? 'pr-11' : 'pr-3.5',
              error
                ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15'
                : 'border-slate-200 hover:border-slate-300 focus:border-brand-blue focus:ring-brand-blue/15',
              className ?? '',
            ].join(' ')}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
              aria-label={revealed ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {revealed ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="flex animate-fade-in items-start gap-1.5 text-sm font-medium text-red-600">
            <AlertCircleIcon size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-sm text-slate-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
TextField.displayName = 'TextField';
