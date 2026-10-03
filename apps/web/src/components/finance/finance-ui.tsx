'use client';

import { SelectField, TextField, type BadgeTone } from '@schovexa/ui';
import { CalendarDays, School } from 'lucide-react';
import { StudentPhoto } from '../student-photo';
import { useFinanceClasses } from '../../hooks/useFinance';

export { StudentPhoto };

export const FEE_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', WAIVED: 'Waived' };
export const FEE_STATUS_TONES: Record<string, BadgeTone> = { PENDING: 'warning', PARTIALLY_PAID: 'info', PAID: 'success', WAIVED: 'neutral' };

export const REFUND_STATUS_LABELS: Record<string, string> = { REQUESTED: 'Waiting for approval', APPROVED: 'Approved — ready to pay out', REJECTED: 'Rejected', PROCESSED: 'Paid out' };
export const REFUND_STATUS_TONES: Record<string, BadgeTone> = { REQUESTED: 'warning', APPROVED: 'info', REJECTED: 'danger', PROCESSED: 'success' };

export const CONCESSION_STATUS_LABELS: Record<string, string> = { REQUESTED: 'Waiting for approval', APPROVED: 'Approved — ready to apply', REJECTED: 'Rejected', APPLIED: 'Applied' };
export const CONCESSION_STATUS_TONES: Record<string, BadgeTone> = { REQUESTED: 'warning', APPROVED: 'info', REJECTED: 'danger', APPLIED: 'success' };
export const CONCESSION_KIND_LABELS: Record<string, string> = { DISCOUNT: 'Discount', SCHOLARSHIP: 'Scholarship', CONCESSION: 'Concession' };

/** "2026-10-03" or an ISO instant → "3 Oct 2026". */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Class + section filter that finance can use without access to class management. */
export function ClassSectionFilters({
  classId,
  sectionId,
  onChange,
}: {
  classId: string;
  sectionId: string;
  onChange: (next: { classId: string; sectionId: string }) => void;
}) {
  const { data: classes } = useFinanceClasses();
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];
  return (
    <>
      <SelectField fieldSize="sm" aria-label="Class" leftIcon={<School size={16} />} value={classId} onChange={(e) => onChange({ classId: e.target.value, sectionId: '' })}>
        <option value="">All classes</option>
        {classes?.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </SelectField>
      <SelectField fieldSize="sm" aria-label="Section" leftIcon={<School size={16} />} value={sectionId} disabled={!classId} onChange={(e) => onChange({ classId, sectionId: e.target.value })}>
        <option value="">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </SelectField>
    </>
  );
}

export function DateRangeFilters({ from, to, onChange }: { from: string; to: string; onChange: (next: { from: string; to: string }) => void }) {
  return (
    <>
      <TextField label="From" type="date" value={from} max={to || undefined} leftIcon={<CalendarDays size={16} />} onChange={(e) => onChange({ from: e.target.value, to })} />
      <TextField label="To" type="date" value={to} min={from || undefined} leftIcon={<CalendarDays size={16} />} onChange={(e) => onChange({ from, to: e.target.value })} />
    </>
  );
}

export const FILTER_PANEL = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5';
export const RESULT_PANEL = 'mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5';
