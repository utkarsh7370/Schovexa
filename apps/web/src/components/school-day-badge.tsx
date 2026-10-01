import { SCHOOL_DAY_STYLE, isHalfDay, schoolDayMeta, type SchoolDay } from '../lib/school-day';

// "First half" / "Second half" pill for students who attend only part of the
// day. Renders nothing for a full-day student (the normal case), so lists
// stay quiet and the exceptions are the only thing that stands out.
export function SchoolDayBadge({ value, className = '', showFull = false }: { value: SchoolDay | null | undefined; className?: string; showFull?: boolean }) {
  if (!isHalfDay(value) && !showFull) return null;
  const meta = schoolDayMeta(value);
  const style = isHalfDay(value) ? SCHOOL_DAY_STYLE[value].pill : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span
      title={meta.description}
      className={['inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset', style, className].join(' ')}
    >
      <meta.icon size={13} /> {meta.short}
    </span>
  );
}
