import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

// Label + input + error, always together — docs/frontend-architecture.md
// §7: "forms use semantic labels, not placeholder-only fields." Every
// screen's form fields go through this one component rather than each
// page hand-rolling label/error markup.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, helperText, id, className, ...props }, ref) => {
    const generatedId = useId();
    // Defaults to the field's `name` (what react-hook-form's register()
    // spread actually sets) rather than a random id — every input ends
    // up addressable by its own field name, which both scripted tests
    // and simple CSS targeting rely on, not just label association.
    const inputId = id ?? props.name ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-navy">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={[
            'h-10 rounded-lg border px-3 text-sm text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue',
            error ? 'border-red-400' : 'border-slate-300',
            className ?? '',
          ].join(' ')}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-sm text-red-600">
            {error}
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
