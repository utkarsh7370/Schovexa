import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'soft-danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-gradient bg-[length:160%_100%] text-white shadow-glow hover:bg-right hover:shadow-[0_14px_34px_-8px_rgba(0,128,240,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:ring-brand-blue disabled:bg-none disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0',
  secondary:
    'bg-white text-navy border border-slate-200 shadow-card hover:border-brand-blue/40 hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0 active:scale-[0.98] focus-visible:ring-brand-blue disabled:text-slate-400 disabled:border-slate-200 disabled:shadow-none disabled:hover:translate-y-0',
  danger:
    'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-[0_8px_20px_-8px_rgba(220,38,38,0.6)] hover:from-red-600 hover:to-red-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:ring-red-600 disabled:from-red-300 disabled:to-red-300 disabled:shadow-none disabled:hover:translate-y-0',
  'soft-danger':
    'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-100 hover:ring-red-300 active:scale-[0.98] focus-visible:ring-red-500 disabled:text-red-300 disabled:ring-red-100',
  ghost:
    'bg-transparent text-navy hover:bg-slate-100 active:scale-[0.98] focus-visible:ring-brand-blue disabled:text-slate-400',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-7 text-base rounded-xl',
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
          'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className ?? '',
        ].join(' ')}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size={16} className={variant === 'primary' || variant === 'danger' ? 'text-white' : variant === 'soft-danger' ? 'text-red-600' : 'text-navy'} />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
