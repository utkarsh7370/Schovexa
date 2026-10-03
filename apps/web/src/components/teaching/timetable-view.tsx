'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, SelectField, Skeleton, Tabs, TextField, useToast } from '@schovexa/ui';
import { CalendarClock, Plus, Repeat2, Trash2, UserCheck } from 'lucide-react';
import { usePlanningOptions, useSubstitutions, useTeachingOptions, useTimetable, useTodaySchedule, type Lesson, type TimetableSlot } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { DAY_NAMES, addDays, isoDay, shortDay, useRefreshTeaching } from './teaching-ui';

/** The next calendar date (today or later) that falls on ISO weekday `day` (1 = Monday). */
function nextOccurrence(day: number): string {
  const today = isoDay(new Date());
  const now = ((new Date(`${today}T00:00:00`).getDay() + 6) % 7) + 1;
  return addDays(today, (day - now + 7) % 7);
}

function Grid({ slots, showTeacher, showSection, onPick }: { slots: TimetableSlot[]; showTeacher: boolean; showSection: boolean; onPick?: (slot: TimetableSlot) => void }) {
  const periods = useMemo(() => [...new Set(slots.map((s) => s.period))].sort((a, b) => a - b), [slots]);
  const days = useMemo(() => {
    const max = Math.max(5, ...slots.map((s) => s.dayOfWeek));
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [slots]);
  if (slots.length === 0) return <EmptyState icon={<CalendarClock size={22} />} title="Nothing on the timetable" description="Lessons appear here once the coordinator has scheduled them." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-20" />
            {days.map((d) => (
              <th key={d} className="rounded-lg bg-slate-50 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">{DAY_NAMES[d]!.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const first = slots.find((s) => s.period === period)!;
            return (
              <tr key={period}>
                <th className="px-2 text-center text-xs font-semibold text-slate-500">
                  P{period}
                  <span className="block font-normal tabular-nums text-slate-400">{first.startTime}</span>
                </th>
                {days.map((d) => {
                  const cell = slots.filter((s) => s.period === period && s.dayOfWeek === d);
                  return (
                    <td key={d} className="align-top">
                      {cell.map((s) => {
                        const body = (
                          <>
                            <span className="block truncate font-bold text-navy">{s.subject.name}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {[showSection ? s.section.name : null, showTeacher ? s.teacher.name : null, s.room].filter(Boolean).join(' · ')}
                            </span>
                          </>
                        );
                        return onPick ? (
                          <button key={s.id} type="button" onClick={() => onPick(s)} className="mb-1 block w-full rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-2 py-1.5 text-left transition-colors hover:border-brand-blue hover:bg-brand-blue/10">
                            {body}
                          </button>
                        ) : (
                          <div key={s.id} className="mb-1 rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-2 py-1.5">{body}</div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LessonList({ lessons }: { lessons: Lesson[] }) {
  if (lessons.length === 0) return <EmptyState icon={<CalendarClock size={22} />} title="No lessons today" description="Nothing is scheduled for you on this day." />;
  return (
    <ul className="flex flex-col gap-2">
      {lessons.map((l) => (
        <li key={`${l.slotId}-${l.kind}`} className={['flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3', l.kind === 'COVERED' ? 'opacity-60' : ''].join(' ')}>
          <div className="w-20 shrink-0 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Period {l.period}</p>
            <p className="text-sm font-bold tabular-nums text-navy">{l.startTime}</p>
            <p className="text-xs tabular-nums text-slate-400">{l.endTime}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className={['font-bold text-navy', l.kind === 'COVERED' ? 'line-through' : ''].join(' ')}>{l.subject.name}</p>
            <p className="text-sm text-slate-500">{l.section.name}{l.room ? ` · room ${l.room}` : ''}</p>
          </div>
          {l.kind === 'COVER' && <Badge tone="warning">You are covering{l.otherTeacher ? ` for ${l.otherTeacher}` : ''}</Badge>}
          {l.kind === 'COVERED' && <Badge tone="neutral">Covered by {l.otherTeacher ?? 'someone else'}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function SlotDialog({ open, section, onClose }: { open: boolean; section: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = usePlanningOptions('timetable', open);
  const [sectionId, setSectionId] = useState(section);
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [dayOfWeek, setDay] = useState('1');
  const [period, setPeriod] = useState('1');
  const [startTime, setStart] = useState('09:00');
  const [endTime, setEnd] = useState('09:45');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sec = sectionId || section;

  const assignments = (options?.assignments ?? []).filter((a) => a.sectionId === sec);
  const subjects = (options?.subjects ?? []).filter((s) => assignments.some((a) => a.subjectId === s.id));
  const teachers = (options?.teachers ?? []).filter((t) => assignments.some((a) => a.teacherId === t.id && (!subjectId || a.subjectId === subjectId)));

  const save = async () => {
    if (!sec || !subjectId || !teacherId) return setError('Choose a class, subject and teacher.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/timetable', { sectionId: sec, subjectId, teacherId, dayOfWeek: Number(dayOfWeek), period: Number(period), startTime, endTime, room: room.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: 'Lesson added' });
      setSubjectId('');
      setTeacherId('');
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
      title="Add a lesson"
      description="The teacher must already be assigned to this class and subject. A teacher can’t be in two classes in the same period."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Add lesson</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Class" value={sec} onChange={(e) => { setSectionId(e.target.value); setSubjectId(''); setTeacherId(''); }}>
          <option value="">Choose a class</option>
          {options?.sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField label="Subject" value={subjectId} disabled={!sec} onChange={(e) => { setSubjectId(e.target.value); setTeacherId(''); }}>
          <option value="">Choose a subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField label="Teacher" value={teacherId} disabled={!subjectId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">{subjectId ? 'Choose a teacher' : 'Choose a subject first'}</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </SelectField>
        <TextField label="Room" value={room} maxLength={40} onChange={(e) => setRoom(e.target.value)} />
        <SelectField label="Day" value={dayOfWeek} onChange={(e) => setDay(e.target.value)}>
          {DAY_NAMES.slice(1, 7).map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </SelectField>
        <TextField label="Period" type="number" min={1} max={15} value={period} onChange={(e) => setPeriod(e.target.value)} />
        <TextField label="Starts" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
        <TextField label="Ends" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
      </div>
    </Dialog>
  );
}

function CoverDialog({ slot, onClose }: { slot: TimetableSlot | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = usePlanningOptions('timetable', !!slot);
  const [date, setDate] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = date || (slot ? nextOccurrence(slot.dayOfWeek) : '');

  const save = async () => {
    if (!slot || !teacherId) return setError('Choose who will cover.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/timetable/substitutions', { slotId: slot.id, date: when, substituteTeacherId: teacherId, reason: reason.trim() || undefined });
      await refresh();
      toast.show({ tone: 'success', title: 'Cover arranged', description: 'Both teachers have been told.' });
      setDate('');
      setTeacherId('');
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!slot}
      onClose={onClose}
      title="Arrange cover"
      description={slot ? `${slot.subject.name} · ${slot.section.name} · ${DAY_NAMES[slot.dayOfWeek]} period ${slot.period} (${slot.teacher.name})` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>Arrange cover</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <TextField label="Date" type="date" value={when} onChange={(e) => setDate(e.target.value)} helperText={slot ? `Must be a ${DAY_NAMES[slot.dayOfWeek]}.` : undefined} />
        <SelectField label="Covering teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Choose a teacher</option>
          {options?.teachers.filter((t) => t.id !== slot?.teacher.id).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </SelectField>
        <TextField label="Reason (optional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

function Covers({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const from = isoDay(new Date());
  const to = addDays(from, 28);
  const { data, isLoading } = useSubstitutions(from, to);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/timetable/substitutions/${removing}`);
      await refresh();
      setRemoving(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not cancel', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!data || data.length === 0) return <EmptyState icon={<Repeat2 size={22} />} title="No cover arranged" description="Substitute lessons for the next four weeks appear here." />;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div>
              <p className="font-semibold text-navy">{shortDay(s.date)} · period {s.slot.period} · {s.slot.subject.name} · {s.slot.section.name}</p>
              <p className="text-sm text-slate-500">{s.slot.teacher.name} → <span className="font-medium text-navy">{s.substitute.name}</span>{s.reason ? ` · ${s.reason}` : ''}</p>
            </div>
            {canManage && (
              <Button size="sm" variant="ghost" aria-label="Cancel this cover" onClick={() => setRemoving(s.id)}>
                <Trash2 size={14} />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!removing} title="Cancel this cover?" description="The original teacher takes the lesson again and both are told." confirmLabel="Cancel cover" tone="danger" loading={busy} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </>
  );
}

export function TimetableView() {
  const { can } = useCan();
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const canManage = can('timetable.manage');
  const teaches = can('teaching.dashboard');
  const [tab, setTab] = useState(teaches ? 'mine' : 'class');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(isoDay(new Date()));
  const [adding, setAdding] = useState(false);
  const [cover, setCover] = useState<TimetableSlot | null>(null);
  const [removing, setRemoving] = useState<TimetableSlot | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = useTimetable({ mine: true });
  const today = useTodaySchedule(date);
  const teaching = useTeachingOptions(teaches && !canManage);
  const planning = usePlanningOptions('timetable', canManage);
  const sections = canManage ? planning.data?.sections : teaching.data?.sections;
  const effectiveSection = sectionId || sections?.[0]?.id || '';
  const classTable = useTimetable({ sectionId: effectiveSection });

  const removeSlot = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/timetable/${removing.id}`);
      await refresh();
      setRemoving(null);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the lesson', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    ...(teaches ? [{ id: 'mine', label: 'My timetable' }] : []),
    { id: 'class', label: 'Class timetable' },
    { id: 'cover', label: 'Cover' },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Teaching"
        title="Timetable"
        description={canManage ? 'Build the weekly timetable and arrange cover. Teachers see changes straight away.' : 'Your week, each class’s week, and any lessons you are covering.'}
        action={
          canManage ? (
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} /> Add lesson
            </Button>
          ) : undefined
        }
      />
      <Tabs className="mt-6 w-fit max-w-full" value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'mine' && (
        <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5 xl:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-navy">{date === isoDay(new Date()) ? 'Today' : shortDay(date)}</h2>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</Button>
                <Button size="sm" variant="ghost" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>›</Button>
              </div>
            </div>
            <div className="mt-3">{today.isLoading ? <Skeleton className="h-40 w-full" /> : <LessonList lessons={today.data?.lessons ?? []} />}</div>
          </section>
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5 xl:col-span-2">
            <h2 className="mb-3 text-lg font-bold text-navy">My week</h2>
            {mine.isLoading ? <Skeleton className="h-64 w-full" /> : <Grid slots={mine.data ?? []} showTeacher={false} showSection />}
          </section>
        </div>
      )}

      {tab === 'class' && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SelectField fieldSize="sm" aria-label="Class" value={effectiveSection} onChange={(e) => setSectionId(e.target.value)} className="w-56">
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
            {canManage && <p className="flex items-center gap-1 text-xs text-slate-400"><UserCheck size={14} /> Click a lesson to arrange cover.</p>}
          </div>
          {classTable.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Grid slots={classTable.data ?? []} showTeacher showSection={false} onPick={canManage ? setCover : undefined} />
              {canManage && (classTable.data?.length ?? 0) > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2 text-xs">
                  {classTable.data!.map((s) => (
                    <li key={s.id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-500">
                      {DAY_NAMES[s.dayOfWeek]!.slice(0, 3)} P{s.period} {s.subject.name}
                      <button type="button" aria-label={`Remove ${s.subject.name} on ${DAY_NAMES[s.dayOfWeek]} period ${s.period}`} className="text-slate-400 hover:text-red-600" onClick={() => setRemoving(s)}>
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'cover' && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
          <Covers canManage={canManage} />
        </section>
      )}

      {canManage && <SlotDialog open={adding} section={effectiveSection} onClose={() => setAdding(false)} />}
      {canManage && <CoverDialog slot={cover} onClose={() => setCover(null)} />}
      <ConfirmDialog
        open={!!removing}
        title="Remove this lesson?"
        description={removing ? `${removing.subject.name} · ${removing.section.name} · ${DAY_NAMES[removing.dayOfWeek]} period ${removing.period}` : undefined}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={removeSlot}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

