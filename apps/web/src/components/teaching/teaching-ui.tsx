'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, SelectField, useToast, type BadgeTone } from '@schovexa/ui';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { useTeachingOptions, type FileInfo, type MarksStatus, type Priority, type SubmissionStatus } from '../../hooks/useTeaching';
import { api, ApiError, downloadFile } from '../../lib/api-client';

export const PRIORITY_TONES: Record<Priority, BadgeTone> = { LOW: 'neutral', NORMAL: 'info', HIGH: 'danger' };
export const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High priority' };

export const SUBMISSION_LABELS: Record<SubmissionStatus, string> = { PENDING: 'Not yet', SUBMITTED: 'Handed in', REVIEWED: 'Reviewed', RESUBMIT: 'Redo' };
export const SUBMISSION_TONES: Record<SubmissionStatus, BadgeTone> = { PENDING: 'neutral', SUBMITTED: 'info', REVIEWED: 'success', RESUBMIT: 'warning' };

export const MARKS_LABELS: Record<MarksStatus, string> = { DRAFT: 'Entering marks', SUBMITTED: 'Waiting for review', REVIEWED: 'Waiting for approval', APPROVED: 'Approved', PUBLISHED: 'Published', CORRECTION: 'Open for correction' };
export const MARKS_TONES: Record<MarksStatus, BadgeTone> = { DRAFT: 'neutral', SUBMITTED: 'warning', REVIEWED: 'info', APPROVED: 'brand', PUBLISHED: 'success', CORRECTION: 'danger' };

export const ATTENDANCE_LABELS: Record<string, string> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused', HALF_DAY: 'Half day' };

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "2026-10-03" → "Sat, 3 Oct". */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

/** Anything a teacher changed — refresh every teaching list, plus the lists other pages show. */
export function useRefreshTeaching() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(['teaching', 'notices', 'notifications', 'attendance-roster', 'students'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };
}

/** Section picker limited to what this person teaches, and a subject picker limited to that section's subjects. */
export function SectionSubjectSelect({
  sectionId,
  subjectId,
  onChange,
  requireSubject = true,
  sectionLabel = 'Class',
  disabled,
}: {
  sectionId: string;
  subjectId: string;
  onChange: (next: { sectionId: string; subjectId: string }) => void;
  requireSubject?: boolean;
  sectionLabel?: string;
  disabled?: boolean;
}) {
  const { data } = useTeachingOptions();
  const subjectsHere = (data?.pairs ?? []).filter((p) => p.sectionId === sectionId).map((p) => p.subjectId);
  const subjects = (data?.subjects ?? []).filter((s) => subjectsHere.includes(s.id));
  return (
    <>
      <SelectField label={sectionLabel} value={sectionId} disabled={disabled} onChange={(e) => onChange({ sectionId: e.target.value, subjectId: '' })}>
        <option value="">Choose a class</option>
        {data?.sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </SelectField>
      {requireSubject && (
        <SelectField label="Subject" value={subjectId} disabled={disabled || !sectionId} onChange={(e) => onChange({ sectionId, subjectId: e.target.value })}>
          <option value="">{sectionId ? 'Choose a subject' : 'Choose a class first'}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
      )}
    </>
  );
}

const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Files attached to a record (a homework brief, study material, a leave note): list, add, download, remove. */
export function FilePanel({ basePath, files, canEdit, canRemove = canEdit, onChanged, title = 'Attachments', hint }: { basePath: string; files: FileInfo[]; canEdit: boolean; canRemove?: boolean; onChanged: () => void | Promise<void>; title?: string; hint?: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('file', file);
      await api.postForm(basePath, form);
      await onChanged();
      toast.show({ tone: 'success', title: 'File added' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not add the file', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };
  const download = async (f: FileInfo) => {
    setBusy(f.id);
    try {
      await downloadFile(`${basePath}/${f.id}`, f.fileName);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not download', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (f: FileInfo) => {
    setBusy(f.id);
    try {
      await api.delete(`${basePath}/${f.id}`);
      await onChanged();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the file', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
          <Paperclip size={15} className="text-brand-blue" /> {title}
        </h3>
        {canEdit && (
          <>
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Add a file" onChange={(e) => upload(e.target.files?.[0])} />
            <Button size="sm" variant="secondary" loading={busy === 'upload'} onClick={() => input.current?.click()}>
              <Upload size={14} /> Add file
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{hint ?? 'No files yet. PDF, JPEG or PNG.'}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText size={16} className="shrink-0 text-slate-400" />
                <span className="truncate font-medium text-navy">{f.fileName}</span>
                <span className="shrink-0 text-xs text-slate-400">{sizeLabel(f.sizeBytes)}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" loading={busy === f.id} onClick={() => download(f)} aria-label={`Download ${f.fileName}`}>
                  <Download size={14} />
                </Button>
                {canRemove && (
                  <Button size="sm" variant="ghost" onClick={() => remove(f)} aria-label={`Remove ${f.fileName}`}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
