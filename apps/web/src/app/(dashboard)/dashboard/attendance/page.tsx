'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Badge, Button, EmptyState, PageHeader, SelectField, Skeleton, StatCard, TextField, useToast } from '@schovexa/ui';
import {
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Lock,
  ListChecks,
  MessageCircle,
  Save,
  School,
  Shapes,
  ShieldCheck,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useAbsenceAlerts, absenceAlertsQueryKey, useAttendanceRoster, useAttendanceSummary, useAttendanceToday, rosterQueryKey, type AbsenceAlertSummary, type AttendanceStatus } from '../../../../hooks/useAttendance';
import { api, ApiError } from '../../../../lib/api-client';
import { SchoolDayBadge } from '../../../../components/school-day-badge';
import { isHalfDay } from '../../../../lib/school-day';

const STATUSES: { value: AttendanceStatus; label: string; short: string; icon: typeof CircleCheck; active: string; text: string; dot: string }[] = [
  { value: 'PRESENT', label: 'Present', short: 'P', icon: CircleCheck, active: 'border-emerald-500 bg-emerald-500 text-white shadow-[0_6px_16px_-6px_rgba(16,185,129,0.7)]', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  { value: 'ABSENT', label: 'Absent', short: 'A', icon: CircleAlert, active: 'border-red-500 bg-red-500 text-white shadow-[0_6px_16px_-6px_rgba(239,68,68,0.7)]', text: 'text-red-600', dot: 'bg-red-500' },
  { value: 'LATE', label: 'Late', short: 'L', icon: Clock, active: 'border-amber-500 bg-amber-500 text-white shadow-[0_6px_16px_-6px_rgba(245,158,11,0.7)]', text: 'text-amber-600', dot: 'bg-amber-500' },
  { value: 'EXCUSED', label: 'Excused', short: 'E', icon: ShieldCheck, active: 'border-slate-500 bg-slate-500 text-white shadow-[0_6px_16px_-6px_rgba(100,116,139,0.7)]', text: 'text-slate-600', dot: 'bg-slate-400' },
];

function toDateInput(date: Date): string {
  // Local calendar date, not UTC — otherwise "today" flips a day early or late near midnight.
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Pure calendar maths on YYYY-MM-DD strings (via UTC, so no zone or DST can shift the day).
const shiftIso = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export default function AttendancePage() {
  const { data: classes } = useClasses();
  const { data: school } = useAttendanceToday();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [pickedDate, setPickedDate] = useState('');
  const { data: sections } = useSections(classId || undefined);
  const className = classes?.find((c) => c.id === classId)?.name;
  const sectionName = sections?.find((s) => s.id === sectionId)?.name;

  // Attendance is a same-day record: only the school's today can be
  // marked or changed (the server enforces this too). Until the server
  // has told us what "today" is, fall back to the browser's date.
  const today = school?.today ?? toDateInput(new Date());
  const date = pickedDate || today;
  const mode: 'edit' | 'locked' | 'future' = date === today ? 'edit' : date < today ? 'locked' : 'future';
  const yesterday = shiftIso(today, -1);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Teaching" title="Attendance" description="Mark today’s attendance in a few taps, then review how each class is doing." />

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            label="Class"
            leftIcon={<School size={16} />}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId('');
            }}
          >
            <option value="">Select a class</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Section" leftIcon={<Shapes size={16} />} disabled={!classId} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">{classId ? 'Select a section' : 'Pick a class first'}</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Date" type="date" max={today} value={date} onChange={(e) => setPickedDate(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: 'Today', value: today },
            { label: 'Yesterday (view only)', value: yesterday },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setPickedDate(d.value)}
              aria-pressed={date === d.value}
              className={['rounded-full px-3 py-1 text-xs font-semibold transition-colors', date === d.value ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {!sectionId && (
        <div className="mt-6">
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title="Choose a class and section to begin"
            description="Pick where you’re taking attendance from the boxes above and the student list appears here."
          />
        </div>
      )}

      {sectionId && mode === 'future' && (
        <div className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="Attendance can’t be marked in advance"
            description="You can only mark attendance on the day itself. Pick today’s date to continue."
            action={
              <Button variant="secondary" onClick={() => setPickedDate(today)}>
                Go to today
              </Button>
            }
          />
        </div>
      )}

      {sectionId && date && mode !== 'future' && (
        <div className="mt-6">
          {/* key forces a full remount on section/date change, so local
              marking state (including the "Saved" confirmation) always
              starts fresh rather than needing to be reset by an effect
              racing against the post-save roster refetch below. */}
          <MarkingPanel key={`${sectionId}-${date}`} sectionId={sectionId} date={date} locked={mode === 'locked'} title={`${className ?? ''} · Section ${sectionName ?? ''}`} />
        </div>
      )}

      {sectionId && (
        <div className="mt-6">
          <SummaryPanel sectionId={sectionId} today={today} />
        </div>
      )}
    </div>
  );
}

function MarkingPanel({ sectionId, date, title, locked }: { sectionId: string; date: string; title: string; locked: boolean }) {
  const { data: roster, isLoading } = useAttendanceRoster(sectionId, date);
  const { data: alerts } = useAbsenceAlerts(sectionId, date);
  const alertByStudent = useMemo(() => new Map((alerts ?? []).map((a) => [a.studentId, a])), [alerts]);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [entries, setEntries] = useState<Record<string, { status: AttendanceStatus | null; remarks: string }>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!roster) return;
    setEntries(Object.fromEntries(roster.map((r) => [r.studentId, { status: r.status, remarks: r.remarks ?? '' }])));
    // Deliberately NOT resetting `saved` here: this effect also re-runs
    // right after a successful save (the roster refetch it triggers),
    // which would otherwise race with — and can clobber — the "Saved"
    // confirmation set by save() below. Editing a mark already clears
    // `saved` explicitly (setStatus/setRemarks); a genuinely new
    // section/date is handled by this component remounting (see the
    // `key` on <MarkingPanel> in the parent), which starts `saved` fresh.
  }, [roster]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus | 'UNMARKED', number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, UNMARKED: 0 };
    (roster ?? []).forEach((s) => {
      const status = entries[s.studentId]?.status;
      if (status) c[status] += 1;
      else c.UNMARKED += 1;
    });
    return c;
  }, [roster, entries]);

  const total = roster?.length ?? 0;
  const marked = total - counts.UNMARKED;
  const pct = total ? Math.round((marked / total) * 100) : 0;

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({ ...prev, [studentId]: { status, remarks: prev[studentId]?.remarks ?? '' } }));
    setSaved(false);
  };

  const setRemarks = (studentId: string, remarks: string) => {
    setEntries((prev) => ({ ...prev, [studentId]: { status: prev[studentId]?.status ?? null, remarks } }));
    setSaved(false);
  };

  // Only fills students not yet marked — never overwrites a mark the
  // teacher already made (e.g. an Absent typed before pressing this).
  const markRestPresent = () => {
    setEntries((prev) => {
      const next = { ...prev };
      (roster ?? []).forEach((s) => {
        if (!next[s.studentId]?.status) next[s.studentId] = { status: 'PRESENT', remarks: next[s.studentId]?.remarks ?? '' };
      });
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    const records = Object.entries(entries)
      .filter(([, v]) => v.status !== null)
      .map(([studentId, v]) => ({ studentId, status: v.status as AttendanceStatus, remarks: v.remarks || undefined }));
    if (records.length === 0) {
      setServerError('Mark at least one student before saving.');
      return;
    }
    setServerError(null);
    setSaving(true);
    try {
      await api.post('/attendance', { sectionId, date, records });
      await queryClient.invalidateQueries({ queryKey: rosterQueryKey(sectionId, date) });
      await queryClient.invalidateQueries({ queryKey: absenceAlertsQueryKey(sectionId, date) });
      // Broad prefix match (no exact from/to) — the Summary panel is a
      // sibling with its own date-range state this component doesn't
      // know, so every mounted summary query for any range needs to
      // refetch, not just one specific key.
      await queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
      setSaved(true);
      const absentCount = records.filter((r) => r.status === 'ABSENT').length;
      toast.show({
        tone: 'success',
        title: 'Attendance saved',
        description: `${records.length} ${records.length === 1 ? 'student' : 'students'} recorded for ${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.${absentCount ? ` Parents of ${absentCount === 1 ? 'the absent student have' : `the ${absentCount} absent students have`} been messaged.` : ''}`,
      });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading class list">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {locked && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <Lock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            <span className="font-bold">This day is locked.</span> Attendance can only be marked or changed on the day itself. You can still see what was recorded, but it can no longer be edited.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Present" tone="emerald" icon={<CircleCheck size={18} />} value={counts.PRESENT} hint={`of ${total} students`} />
        <StatCard label="Absent" tone="violet" icon={<CircleAlert size={18} />} value={counts.ABSENT} hint={counts.ABSENT ? 'Consider informing parents' : 'Nobody absent'} />
        <StatCard label="Late" tone="amber" icon={<Clock size={18} />} value={counts.LATE} />
        <StatCard
          label={locked ? 'No record' : 'Not marked yet'}
          tone="default"
          icon={<CircleHelp size={18} />}
          value={counts.UNMARKED}
          hint={locked ? (counts.UNMARKED ? 'Nothing was recorded for them' : 'Everyone has a record') : counts.UNMARKED ? 'Needs a mark before saving' : 'Everyone is marked'}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <header className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-blue ring-1 ring-inset ring-brand-blue/15">
              <ListChecks size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-navy">{title}</h2>
              <p className="text-sm text-slate-500">
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <Button size="sm" variant="secondary" onClick={markRestPresent} disabled={counts.UNMARKED === 0}>
                <CircleCheck size={15} className="text-emerald-500" /> Mark rest present
              </Button>
            )}
          </div>
        </header>

        <div className="border-b border-slate-100 px-5 py-3 sm:px-6">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>
              <span className="font-bold text-navy">{marked}</span> of {total} {locked ? 'recorded' : 'marked'}
            </span>
            <span className="font-semibold text-navy">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Marking progress">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {roster && roster.some((r) => isHalfDay(r.schoolDay)) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-600 sm:px-6">
            <span className="font-semibold text-navy">Half-day students in this section:</span>
            {(['FIRST_HALF', 'SECOND_HALF'] as const).map((day) => {
              const n = roster.filter((r) => r.schoolDay === day).length;
              return n > 0 ? <SchoolDayBadge key={day} value={day} className="!text-[11px]" /> : null;
            })}
            <span className="text-slate-400">— look for the coloured rows.</span>
          </div>
        )}

        {serverError && (
          <div className="px-5 pt-4 sm:px-6">
            <Alert variant="error">{serverError}</Alert>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {roster?.map((student) => {
            const entry = entries[student.studentId];
            const name = `${student.firstName} ${student.lastName}`;
            return (
              <li
                key={student.studentId}
                className={[
                  'flex flex-col gap-3 border-l-4 px-5 py-3.5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:px-6',
                  isHalfDay(student.schoolDay) ? (student.schoolDay === 'FIRST_HALF' ? 'border-amber-300 bg-amber-50/40' : 'border-indigo-300 bg-indigo-50/40') : 'border-transparent',
                ].join(' ')}
              >
                <div className="flex min-w-0 items-center gap-3 sm:w-64 sm:shrink-0">
                  <Avatar name={name} tone="auto" size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">{name}</p>
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-slate-400">{student.admissionNo}</span>
                      <SchoolDayBadge value={student.schoolDay} className="!px-2 !py-0.5 !text-[10px]" />
                    </p>
                    {entry?.status === 'ABSENT' && (
                      <div className="mt-1">
                        <ParentAlertChip saved={student.status === 'ABSENT'} locked={locked} alert={alertByStudent.get(student.studentId)} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5" role="group" aria-label={`Attendance for ${name}`}>
                  {STATUSES.map((option) => {
                    const on = entry?.status === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={on}
                        disabled={locked}
                        onClick={() => setStatus(student.studentId, option.value)}
                        title={option.label}
                        className={[
                          'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-all duration-200 sm:min-w-[5.25rem]',
                          on ? option.active : locked ? 'border-slate-100 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                          locked ? 'cursor-not-allowed' : '',
                          locked && on ? 'opacity-80' : '',
                        ].join(' ')}
                      >
                        <option.icon size={14} className={on ? '' : option.text} />
                        <span className="hidden sm:inline">{option.label}</span>
                        <span className="sm:hidden">{option.short}</span>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  readOnly={locked}
                  placeholder={locked ? 'No remarks' : 'Remarks (optional)'}
                  aria-label={`Remarks for ${name}`}
                  value={entry?.remarks ?? ''}
                  onChange={(e) => setRemarks(student.studentId, e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm placeholder:text-slate-400 transition-all hover:border-slate-300 focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-brand-blue/15"
                />
              </li>
            );
          })}
        </ul>
        {roster?.length === 0 && (
          <div className="p-6">
            <EmptyState icon={<ClipboardCheck size={22} />} title="No students in this section" description="Enrol students into this section from the Students page." />
          </div>
        )}

        {roster && roster.length > 0 && !locked && (
          <footer className="sticky bottom-0 flex flex-col items-stretch justify-between gap-3 border-t border-slate-100 bg-white/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:px-6">
            <p className="flex items-center gap-2 text-sm text-slate-500">
              {saved && !serverError ? (
                <>
                  <CircleCheck size={16} className="text-emerald-500" /> <span className="font-semibold text-emerald-600">Saved</span>
                </>
              ) : counts.UNMARKED > 0 ? (
                <>
                  <Badge tone="warning" dot>
                    {counts.UNMARKED} not marked
                  </Badge>
                  <span className="hidden sm:inline">Unmarked students are skipped when saving.</span>
                </>
              ) : (
                <>
                  <CalendarCheck size={16} className="text-brand-blue" /> Everyone is marked — ready to save.
                </>
              )}
            </p>
            <Button loading={saving} onClick={save}>
              <Save size={16} /> Save attendance
            </Button>
          </footer>
        )}
      </section>
    </div>
  );
}

const PRESETS: { label: string; from: (today: string) => string }[] = [
  { label: 'Last 7 days', from: (today) => shiftIso(today, -6) },
  { label: 'Last 30 days', from: (today) => shiftIso(today, -29) },
  { label: 'This month', from: (today) => `${today.slice(0, 8)}01` },
];

function SummaryPanel({ sectionId, today }: { sectionId: string; today: string }) {
  const [from, setFrom] = useState(shiftIso(today, -6));
  const [to, setTo] = useState(today);
  // `today` first arrives from the browser's clock, then from the server;
  // re-anchor the default range once when it changes.
  useEffect(() => {
    setFrom(shiftIso(today, -6));
    setTo(today);
  }, [today]);
  const { data: summary, isLoading } = useAttendanceSummary(sectionId, from, to);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-blue ring-1 ring-inset ring-brand-blue/15">
          <CalendarDays size={18} />
        </span>
        <div>
          <h2 className="text-base font-bold text-navy">Summary</h2>
          <p className="text-sm text-slate-500">How each student has attended over a period.</p>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const start = p.from(today);
          const active = from === start && to === today;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFrom(start);
                setTo(today);
              }}
              className={['rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'].join(' ')}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-3 py-3 text-center">Present</th>
              <th className="px-3 py-3 text-center">Absent</th>
              <th className="px-3 py-3 text-center">Late</th>
              <th className="px-3 py-3 text-center">Excused</th>
              <th className="px-4 py-3">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summary?.map((row) => {
              // Late still means the student came to school.
              const rate = row.total ? Math.round(((row.present + row.late) / row.total) * 100) : null;
              const bar = rate === null ? 'bg-slate-200' : rate >= 90 ? 'from-emerald-400 to-teal-500' : rate >= 75 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-red-500';
              const name = `${row.firstName} ${row.lastName}`;
              return (
                <tr key={row.studentId} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={name} tone="auto" size={30} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy">{name}</p>
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-400">{row.admissionNo}</span>
                          <SchoolDayBadge value={row.schoolDay} className="!px-2 !py-0.5 !text-[10px]" />
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-emerald-600">{row.present}</td>
                  <td className="px-3 py-3 text-center font-semibold text-red-600">{row.absent}</td>
                  <td className="px-3 py-3 text-center font-semibold text-amber-600">{row.late}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-500">{row.excused}</td>
                  <td className="px-4 py-3">
                    {rate === null ? (
                      <span className="text-xs text-slate-400">No records</span>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                          <div className={['h-full rounded-full bg-gradient-to-r transition-all duration-700', bar].join(' ')} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="w-10 text-xs font-bold text-navy">{rate}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4">
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {summary?.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No students or records for this range.</p>}
      </div>
    </section>
  );
}


// What happened to the parents of an absent student: told, couldn't be told,
// or not yet (they're messaged when the register is saved).
function ParentAlertChip({ saved, locked, alert }: { saved: boolean; locked: boolean; alert: AbsenceAlertSummary | undefined }) {
  if (!saved) {
    return locked ? null : (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500" title="Parents are messaged when you save the register">
        <MessageCircle size={12} /> Parent will be messaged
      </span>
    );
  }
  if (!alert) return null;
  const reached = alert.parentsReached;
  if (alert.parentCount === 0) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800" title="Link a parent to this student so they can be told about absences">
        <UserX size={12} /> No parent linked
      </span>
    );
  }
  if (reached > 0) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800"
        title={alert.attempts.filter((a) => a.status === 'SENT').map((a) => `${a.parent} — ${a.channel === 'EMAIL' ? 'email' : 'in the app'}`).join('\n')}
      >
        <CheckCheck size={12} /> {reached === 1 ? 'Parent notified' : `${reached} parents notified`}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800" title={alert.attempts.map((a) => `${a.parent}: ${a.detail ?? a.status}`).join('\n')}>
      <TriangleAlert size={12} /> Couldn’t reach parent
    </span>
  );
}
