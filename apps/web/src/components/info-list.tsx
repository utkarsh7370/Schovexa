import type { ReactNode } from 'react';

export interface InfoItem {
  icon?: ReactNode;
  label: string;
  /** Null/empty shows a muted "Not added". */
  value: ReactNode;
}

// A label/value grid for profile details — icon tile, small caps label,
// the value (or a quiet "Not added") — so every person page lists facts the
// same way.
export function InfoList({ items, columns = 2 }: { items: InfoItem[]; columns?: 1 | 2 }) {
  return (
    <dl className={['grid gap-3', columns === 2 ? 'sm:grid-cols-2' : ''].join(' ')}>
      {items.map((item) => {
        const empty = item.value === null || item.value === undefined || item.value === '';
        return (
          <div key={item.label} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
            {item.icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-blue shadow-card">{item.icon}</span>
            )}
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</dt>
              <dd className={['mt-0.5 break-words text-sm', empty ? 'text-slate-400' : 'font-semibold text-navy'].join(' ')}>
                {empty ? 'Not added' : item.value}
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
