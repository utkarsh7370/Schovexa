import type { ReactNode } from 'react';

export type StatTone = 'default' | 'brand' | 'blue' | 'violet' | 'emerald' | 'amber';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  hint?: string;
}

// Each tone is a gradient wash + matching icon tile, so a row of KPI
// cards reads as colorful and scannable instead of four identical white
// boxes. `brand` is the loud one — a full gradient card for the single
// most important number on the page.
const TONES: Record<Exclude<StatTone, 'brand'>, { card: string; icon: string }> = {
  default: { card: 'from-white to-slate-50', icon: 'bg-slate-100 text-slate-600' },
  blue: { card: 'from-sky-50 to-white', icon: 'bg-gradient-to-br from-brand-electric to-brand-blue text-white shadow-glow' },
  violet: { card: 'from-violet-50 to-white', icon: 'bg-gradient-to-br from-brand-blue to-brand-violet text-white shadow-glow-violet' },
  emerald: { card: 'from-emerald-50 to-white', icon: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.55)]' },
  amber: { card: 'from-amber-50 to-white', icon: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_30px_-8px_rgba(245,158,11,0.55)]' },
};

export function StatCard({ label, value, icon, tone = 'default', hint }: StatCardProps) {
  const isBrand = tone === 'brand';
  const t = isBrand ? null : TONES[tone];
  return (
    <div
      className={[
        'group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated',
        isBrand
          ? 'border-transparent bg-brand-gradient bg-[length:180%_180%] text-white shadow-glow animate-gradient-x'
          : ['border-slate-200/80 bg-gradient-to-br shadow-card', t?.card].join(' '),
      ].join(' ')}
    >
      {isBrand && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      )}
      <div className="relative flex items-center justify-between">
        <p className={['text-sm font-medium', isBrand ? 'text-white/85' : 'text-slate-500'].join(' ')}>{label}</p>
        {icon && (
          <div
            className={[
              'flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
              isBrand ? 'bg-white/20 text-white' : t?.icon,
            ].join(' ')}
          >
            {icon}
          </div>
        )}
      </div>
      {/* A <div>, not a <p> — callers pass a <Skeleton> (a <div>) as
          `value` while loading, and a <div> inside a <p> is invalid HTML
          that causes a client/server hydration mismatch. */}
      <div className={['relative mt-3 text-3xl font-extrabold tracking-tight', isBrand ? 'text-white' : 'text-navy'].join(' ')}>
        {value}
      </div>
      {hint && <p className={['relative mt-1 text-xs font-medium', isBrand ? 'text-white/75' : 'text-slate-400'].join(' ')}>{hint}</p>}
    </div>
  );
}
