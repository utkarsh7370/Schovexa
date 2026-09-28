import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}

// The header block every dashboard page uses — title, one-line
// description, and a single primary action, always in the same place.
// Answers "where am I" (title) and "what can I do" (action) the moment
// a page loads, instead of each page hand-rolling its own header markup.
export function PageHeader({ title, description, action, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
