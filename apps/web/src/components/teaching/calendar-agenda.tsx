'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, SelectField, Skeleton, TextAreaField, TextField, useToast, type BadgeTone } from '@schovexa/ui';
import { CalendarDays, MapPin, Plus, Trash2 } from 'lucide-react';
import { useAgenda, useEvents, type AgendaItem, type SchoolEventRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { shortDay, useRefreshTeaching } from './teaching-ui';

const EVENT_KINDS: Record<SchoolEventRow['kind'], string> = { EVENT: 'Event', MEETING: 'Meeting', PARENT_TEACHER: 'Parent–teacher meeting' };
const KIND_TONES: Record<AgendaItem['type'], BadgeTone> = { HOLIDAY: 'danger', EVENT: 'brand', MEETING: 'info', PARENT_TEACHER: 'info', EXAM: 'warning', HOMEWORK_DUE: 'neutral', ASSIGNMENT_DUE: 'neutral', LEAVE: 'success' };
const KIND_LABELS: Record<AgendaItem['type'], string> = { HOLIDAY: 'Holiday', EVENT: 'Event', MEETING: 'Meeting', PARENT_TEACHER: 'PTM', EXAM: 'Exam', HOMEWORK_DUE: 'Homework due', ASSIGNMENT_DUE: 'Assignment due', LEAVE: 'My leave' };
// Holidays are drawn on the calendar itself, and events have their own list below.
const PERSONAL: AgendaItem['type'][] = ['EXAM', 'HOMEWORK_DUE', 'ASSIGNMENT_DUE', 'LEAVE'];

const within = (date: string, start: string, end: string) => date >= start && date <= end;

function EventDialog({ open, onClose, defaultDate }: { open: boolean; onClose: () => void; defaultDate: string }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const [kind, setKind] = useState<SchoolEventRow['kind']>('EVENT');
  const [title, setTitle] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = startDate || defaultDate;

  const save = async () => {
    setError(null);
    if (title.trim().length < 2) return setError('Give it a title.');
    setBusy(true);
    try {
      await api.post('/events', { kind, title: title.trim(), startDate: start, endDate: endDate || undefined, startTime: startTime || undefined, endTime: endTime || undefined, location: location.trim() || undefined, description: description.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: 'Added to the calendar' });
      setTitle('');
      setDescription('');
      setLocation('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Add to the calendar"
      description="Events, staff meetings and parent–teacher meetings show up for everyone who can see the calendar."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Add</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as SchoolEventRow['kind'])}>
          {Object.entries(EVENT_KINDS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectField>
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField label="Ends on (optional)" type="date" value={endDate} min={start} onChange={(e) => setEnd(e.target.value)} />
        <TextField label="Starts (optional)" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <TextField label="Ends (optional)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <div className="sm:col-span-2"><TextField label="Where (optional)" value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} /></div>
        <div className="sm:col-span-2"><TextAreaField label="Details (optional)" rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></div>
      </div>
    </Dialog>
  );
}

/** What is on in the month beside the day grid: my exams and deadlines, plus school events (which managers can edit). */
export function CalendarAgenda({ from, to, selected }: { from: string; to: string; selected: string | null }) {
  const { can } = useCan();
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const personal = can('teaching.dashboard');
  const canSeeEvents = can('event.view');
  const canManage = can('event.manage');
  const agenda = useAgenda(from, to, personal);
  const events = useEvents(from, to, canSeeEvents);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SchoolEventRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (!personal && !canSeeEvents) return null;
  const mine = (agenda.data ?? []).filter((i) => PERSONAL.includes(i.type) && (!selected || within(selected, i.date, i.endDate)));
  const evs = (events.data ?? []).filter((e) => !selected || within(selected, e.startDate, e.endDate));

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/events/${removing.id}`);
      await refresh();
      setRemoving(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-6" aria-label="Agenda">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-navy">
          <CalendarDays size={16} className="text-brand-blue" /> {selected ? shortDay(selected) : 'This month'}
          {selected && <span className="text-xs font-normal text-slate-400">— pick the day again to see the whole month</span>}
        </h2>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add event
          </Button>
        )}
      </div>

      {(agenda.isLoading || events.isLoading) && <Skeleton className="mt-4 h-24 w-full" />}
      {!agenda.isLoading && !events.isLoading && mine.length === 0 && evs.length === 0 && <div className="mt-4"><EmptyState icon={<CalendarDays size={22} />} title="Nothing scheduled" description="Exams, deadlines, meetings and events show up here." /></div>}

      {mine.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {mine.map((i, n) => (
            <li key={`${i.type}-${i.date}-${n}`}>
              <Link href={i.link} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-sm transition-colors hover:border-brand-blue/30">
                <span className="min-w-0">
                  <span className="font-semibold text-navy">{i.title}</span>
                  {i.subtitle && <span className="text-slate-500"> · {i.subtitle}</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {shortDay(i.date)}{i.endDate !== i.date ? ` – ${shortDay(i.endDate)}` : ''}{i.time ? ` · ${i.time}` : ''}
                  <Badge tone={KIND_TONES[i.type]}>{KIND_LABELS[i.type]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {evs.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {evs.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-navy">{e.title} <Badge tone={e.kind === 'EVENT' ? 'brand' : 'info'}>{EVENT_KINDS[e.kind]}</Badge></p>
                <p className="text-xs text-slate-500">
                  {shortDay(e.startDate)}{e.endDate !== e.startDate ? ` – ${shortDay(e.endDate)}` : ''}{e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}
                  {e.location && <span className="ml-2 inline-flex items-center gap-1"><MapPin size={11} /> {e.location}</span>}
                </p>
                {e.description && <p className="mt-1 text-slate-600">{e.description}</p>}
              </div>
              {canManage && (
                <Button size="sm" variant="ghost" aria-label={`Remove ${e.title}`} onClick={() => setRemoving(e)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && <EventDialog open={adding} onClose={() => setAdding(false)} defaultDate={selected ?? from} />}
      <ConfirmDialog open={!!removing} title="Remove this from the calendar?" description={removing?.title} confirmLabel="Remove" tone="danger" loading={busy} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </section>
  );
}
