'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import {
  useAttendanceRoster,
  useAttendanceSummary,
  rosterQueryKey,
  type AttendanceStatus,
} from '../../../../hooks/useAttendance';
import { api, ApiError } from '../../../../lib/api-client';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'P' },
  { value: 'ABSENT', label: 'A' },
  { value: 'LATE', label: 'L' },
  { value: 'EXCUSED', label: 'E' },
];

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-600 text-white border-green-600',
  ABSENT: 'bg-red-600 text-white border-red-600',
  LATE: 'bg-amber-500 text-white border-amber-500',
  EXCUSED: 'bg-slate-500 text-white border-slate-500',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(today());
  const { data: sections } = useSections(classId || undefined);

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-navy">Attendance</h1>
        <p className="mt-1 text-slate-600">Mark daily attendance and review summaries.</p>
      </div>

      <Card className="mt-6 p-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Class</label>
            <select
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
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
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Section</label>
            <select
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              disabled={!classId}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Select a section</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>

      {sectionId && date && (
        <div className="mt-6">
          {/* key forces a full remount on section/date change, so local
              marking state (including the "Saved." confirmation) always
              starts fresh rather than needing to be reset by an effect
              racing against the post-save roster refetch below. */}
          <MarkingPanel key={`${sectionId}-${date}`} sectionId={sectionId} date={date} />
        </div>
      )}

      {sectionId && (
        <div className="mt-6">
          <SummaryPanel sectionId={sectionId} />
        </div>
      )}
    </div>
  );
}

function MarkingPanel({ sectionId, date }: { sectionId: string; date: string }) {
  const { data: roster, isLoading } = useAttendanceRoster(sectionId, date);
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Record<string, { status: AttendanceStatus | null; remarks: string }>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!roster) return;
    setEntries(
      Object.fromEntries(roster.map((r) => [r.studentId, { status: r.status, remarks: r.remarks ?? '' }])),
    );
    // Deliberately NOT resetting `saved` here: this effect also re-runs
    // right after a successful save (the roster refetch it triggers),
    // which would otherwise race with — and can clobber — the "Saved."
    // confirmation set by save() below. Editing a mark already clears
    // `saved` explicitly (setStatus/setRemarks); a genuinely new
    // section/date is handled by this component remounting (see the
    // `key` on <MarkingPanel> in the parent), which starts `saved` fresh.
  }, [roster]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({ ...prev, [studentId]: { status, remarks: prev[studentId]?.remarks ?? '' } }));
    setSaved(false);
  };

  const setRemarks = (studentId: string, remarks: string) => {
    setEntries((prev) => ({ ...prev, [studentId]: { status: prev[studentId]?.status ?? null, remarks } }));
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
      // Broad prefix match (no exact from/to) — the Summary panel is a
      // sibling with its own date-range state this component doesn't
      // know, so every mounted summary query for any range needs to
      // refetch, not just one specific key.
      await queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
      setSaved(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Mark attendance — {date}</h2>
        <Button size="sm" loading={saving} onClick={save}>
          Save attendance
        </Button>
      </div>

      {serverError && (
        <Alert variant="error" className="mt-3">
          {serverError}
        </Alert>
      )}
      {saved && !serverError && (
        <Alert variant="success" className="mt-3">
          Saved.
        </Alert>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {roster?.map((student) => {
          const entry = entries[student.studentId];
          return (
            <div key={student.studentId} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="w-40 shrink-0">
                <p className="text-sm font-medium text-navy">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-xs text-slate-500">{student.admissionNo}</p>
              </div>
              <div className="flex gap-1">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(student.studentId, option.value)}
                    className={[
                      'h-8 w-8 rounded-md border text-xs font-semibold transition-colors',
                      entry?.status === option.value
                        ? STATUS_COLORS[option.value]
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                    title={option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Remarks (optional)"
                value={entry?.remarks ?? ''}
                onChange={(e) => setRemarks(student.studentId, e.target.value)}
                className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-xs focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          );
        })}
        {roster?.length === 0 && <p className="text-sm text-slate-500">No students in this section.</p>}
      </div>
    </Card>
  );
}

function SummaryPanel({ sectionId }: { sectionId: string }) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today());
  const { data: summary } = useAttendanceSummary(sectionId, from, to);

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-navy">Summary</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="py-2">Student</th>
              <th className="py-2 text-center">Present</th>
              <th className="py-2 text-center">Absent</th>
              <th className="py-2 text-center">Late</th>
              <th className="py-2 text-center">Excused</th>
              <th className="py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {summary?.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100">
                <td className="py-2 text-navy">
                  {row.firstName} {row.lastName}
                </td>
                <td className="py-2 text-center">{row.present}</td>
                <td className="py-2 text-center">{row.absent}</td>
                <td className="py-2 text-center">{row.late}</td>
                <td className="py-2 text-center">{row.excused}</td>
                <td className="py-2 text-center font-medium">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary?.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No data for this range.</p>}
      </div>
    </Card>
  );
}
