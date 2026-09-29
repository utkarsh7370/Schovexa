import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lift + soft shadow on hover — for cards that are clickable or worth noticing. */
  interactive?: boolean;
}

export function Card({ className, interactive = false, children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-slate-200/80 bg-white shadow-card',
        interactive ? 'transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-elevated' : '',
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
