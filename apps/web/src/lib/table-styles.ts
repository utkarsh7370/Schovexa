// One look for every data table in the dashboard (reports, outstanding
// fees…): a bordered rounded frame, a tinted header row, hover rows.
export const TABLE = {
  wrap: 'overflow-x-auto rounded-xl border border-slate-100 bg-white',
  table: 'w-full min-w-[34rem] text-left text-sm',
  head: 'bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500',
  th: 'px-4 py-3',
  thCenter: 'px-3 py-3 text-center',
  thRight: 'px-4 py-3 text-right',
  body: 'divide-y divide-slate-100',
  row: 'transition-colors hover:bg-slate-50/70',
  td: 'px-4 py-3',
  tdCenter: 'px-3 py-3 text-center',
  tdRight: 'px-4 py-3 text-right',
} as const;

export function downloadLinkClass(): string {
  return 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:bg-slate-50 hover:shadow-elevated';
}
