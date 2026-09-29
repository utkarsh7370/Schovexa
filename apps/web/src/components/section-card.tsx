import type { ReactNode } from 'react';

export interface SectionCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

// The white panel every profile section (parents, fees, attendance,
// documents…) sits in — icon tile, title, one-line description and an
// optional action, so all panels share one rhythm.
export function SectionCard({ icon, title, description, action, children, className }: SectionCardProps) {
  return (
    <section className={['rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6', className ?? ''].join(' ')}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-blue ring-1 ring-inset ring-brand-blue/15">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-base font-bold text-navy">{title}</h2>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}
