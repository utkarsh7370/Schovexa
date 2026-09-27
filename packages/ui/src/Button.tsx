import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-blue text-white hover:bg-[#006fd6] focus-visible:ring-brand-blue disabled:bg-slate-300',
  secondary:
    'bg-white text-navy border border-slate-300 hover:bg-slate-50 focus-visible:ring-brand-blue disabled:text-slate-400 disabled:border-slate-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 disabled:bg-red-300',
  ghost: 'bg-transparent text-navy hover:bg-slate-100 focus-visible:ring-brand-blue disabled:text-slate-400',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-sm rounded-lg',
  lg: 'h-12 px-6 text-base rounded-lg',
};

// The one Button every screen uses — accessible focus ring, disabled and
// loading states built in, per docs/frontend-architecture.md §7 (no
// interactive component ships without keyboard/focus support from day one).
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2 font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className ?? '',
        ].join(' ')}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size={16} className={variant === 'primary' || variant === 'danger' ? 'text-white' : 'text-navy'} />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
