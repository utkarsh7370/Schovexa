import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

// One shared "nothing here yet" pattern, replacing the handful of
// slightly-different one-line empty messages each page used to write on
// its own — always icon + title + a plain-language explanation + (when
// there's something to do about it) an action.
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-card">{icon}</div>}
      <div>
        <p className="font-semibold text-navy">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
