import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'brand';
  hint?: string;
}

// The one KPI tile every dashboard uses — icon, label, big value, and an
// optional one-line hint underneath. `tone="brand"` gives the single
// most important number on a page (e.g. today's collection) the brand
// gradient treatment; everything else stays a plain white card, so nothing
// is fighting for attention.
export function StatCard({ label, value, icon, tone = 'default', hint }: StatCardProps) {
  const isBrand = tone === 'brand';
  return (
    <div
      className={[
        'rounded-2xl border p-5 shadow-card',
        isBrand ? 'border-transparent bg-brand-gradient text-white' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <p className={['text-sm font-medium', isBrand ? 'text-white/80' : 'text-slate-500'].join(' ')}>{label}</p>
        {icon && (
          <div
            className={[
              'flex h-9 w-9 items-center justify-center rounded-full',
              isBrand ? 'bg-white/15 text-white' : 'bg-brand-blue/10 text-brand-blue',
            ].join(' ')}
          >
            {icon}
          </div>
        )}
      </div>
      <p className={['mt-3 text-2xl font-bold tracking-tight', isBrand ? 'text-white' : 'text-navy'].join(' ')}>{value}</p>
      {hint && <p className={['mt-1 text-xs', isBrand ? 'text-white/70' : 'text-slate-400'].join(' ')}>{hint}</p>}
    </div>
  );
}
