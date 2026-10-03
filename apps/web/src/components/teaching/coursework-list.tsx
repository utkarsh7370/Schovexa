'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Tabs, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { BookOpenCheck, NotebookPen, Plus, SearchX, Users } from 'lucide-react';
import { useCoursework, useTeachingOptions, type CourseworkRow } from '../../hooks/useTeaching';
import { useStudentsPage } from '../../hooks/useStudents';
import { useCan } from '../../hooks/useCan';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api, ApiError } from '../../lib/api-client';
import { FILTER_PANEL, RESULT_PANEL } from '../finance/finance-ui';
import { PRIORITY_LABELS, PRIORITY_TONES, SUBMISSION_LABELS, SUBMISSION_TONES, isoDay, shortDay, useRefreshTeaching } from './teaching-ui';

type Kind = 'HOMEWORK' | 'ASSIGNMENT';

const COPY: Record<Kind, { title: string; noun: string; plural: string; base: string; create: string; description: string; eyebrow: string }> = {
  HOMEWORK: { title: 'Homework', noun: 'homework', plural: 'homework', base: '/dashboard/homework', create: 'homework.create', description: 'Set work for a class or a few students, then tick off who has done it.', eyebrow: 'Teaching' },
  ASSIGNMENT: { title: 'Assignments', noun: 'assignment', plural: 'assignments', base: '/dashboard/assignments', create: 'assignment.create', description: 'Work with a deadline and marks: collect submissions, evaluate, give feedback or ask for a redo.', eyebrow: 'Teaching' },
};

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Past due' },
  { id: 'all', label: 'All' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

function CreateDialog({ kind, open, onClose }: { kind: Kind; open: boolean; onClose: () => void }) {
  const copy = COPY[kind];
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = useTeachingOptions(open);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(() => isoDay(new Date(Date.now() + 86_400_000)));
  const [priority, setPriority] = useState('NORMAL');
  const [maxMarks, setMaxMarks] = useState('20');
  const [onlySome, setOnlySome] = useState(false);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A subject has to be taught in every chosen section.
  const subjects = useMemo(() => {
    if (!options || sectionIds.length === 0) return [];
    return options.subjects.filter((s) => sectionIds.every((id) => options.pairs.some((p) => p.sectionId === id && p.subjectId === s.id)));
  }, [options, sectionIds]);
  useEffect(() => {
    if (subjectId && !subjects.some((s) => s.id === subjectId)) setSubjectId('');
  }, [subjects, subjectId]);

  const single = sectionIds.length === 1 ? sectionIds[0] : undefined;
  const { data: roster } = useStudentsPage({ page: 1, pageSize: 100, sectionId: single ?? '', status: 'ENROLLED' });
  useEffect(() => {
    if (!single) {
      setOnlySome(false);
      setStudentIds([]);
    }
  }, [single]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async () => {
    setError(null);
    if (sectionIds.length === 0) return setError('Choose at least one class.');
    if (!subjectId) return setError('Choose a subject.');
    if (title.trim().length < 2) return setError('Give it a title.');
    if (onlySome && studentIds.length === 0) return setError('Pick the students, or switch back to the whole class.');
    setBusy(true);
    try {
      await api.post(copy.base.replace('/dashboard', ''), {
        kind,
        sectionIds,
        subjectId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate,
        priority,
        maxMarks: kind === 'ASSIGNMENT' && maxMarks ? Number(maxMarks) : undefined,
        studentIds: onlySome ? studentIds : undefined,
      });
      await refresh();
      toast.show({ tone: 'success', title: `${copy.title === 'Homework' ? 'Homework' : 'Assignment'} set`, description: 'Parents of the class have been told.' });
      setTitle('');
      setDescription('');
      setStudentIds([]);
      setOnlySome(false);
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
      eyebrow={copy.eyebrow}
      title={kind === 'HOMEWORK' ? 'Set homework' : 'Add an assignment'}
      description="Parents of the class are notified as soon as you save. You can attach files afterwards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save and notify</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-sm font-semibold text-navy">Classes</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options?.sections.map((s) => {
              const on = sectionIds.includes(s.id);
              return (
                <label key={s.id} className={['flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium', on ? 'border-brand-blue bg-brand-blue/10 text-brand-blue' : 'border-slate-200 text-slate-600'].join(' ')}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setSectionIds(toggle(sectionIds, s.id))} />
                  {s.name}
                </label>
              );
            })}
            {options && options.sections.length === 0 && <p className="text-sm text-slate-500">You are not assigned to any class yet.</p>}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Subject" value={subjectId} disabled={sectionIds.length === 0} onChange={(e) => setSubjectId(e.target.value)} helperText={sectionIds.length > 1 ? 'Only subjects you teach in every chosen class.' : undefined}>
            <option value="">{sectionIds.length === 0 ? 'Choose a class first' : 'Choose a subject'}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
          <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'HOMEWORK' ? 'e.g. Fractions — exercise 4.2' : 'e.g. Water cycle project'} />
        <TextAreaField label="Instructions" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          {kind === 'ASSIGNMENT' && <TextField label="Maximum marks" type="number" min={1} max={1000} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />}
        </div>

        {single && (
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
              <input type="checkbox" checked={onlySome} onChange={(e) => setOnlySome(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Only for some students
            </label>
            {onlySome && (
              <ul className="mt-3 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {roster?.items.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds(toggle(studentIds, s.id))} className="h-4 w-4 rounded border-slate-300" />
                      {s.firstName} {s.lastName}
                      <span className="font-mono text-xs text-slate-400">{s.admissionNo}</span>
                    </label>
                  </li>
                ))}
                {!roster && <Skeleton className="h-16 w-full" />}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function CourseworkCard({ kind, row, parentView }: { kind: Kind; row: CourseworkRow; parentView: boolean }) {
  const copy = COPY[kind];
  const p = row.progress;
  return (
    <li>
      <Link href={`${copy.base}/${row.id}`} className="block rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-colors hover:border-brand-blue/30 hover:bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
              {row.title}
              {row.priority !== 'NORMAL' && <Badge tone={PRIORITY_TONES[row.priority]}>{PRIORITY_LABELS[row.priority]}</Badge>}
              {row.status !== 'ACTIVE' && <Badge tone="neutral">{row.status === 'CANCELLED' ? 'Cancelled' : 'Archived'}</Badge>}
              {row.overdue && <Badge tone="danger">Past due</Badge>}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {row.subject.name} · {row.section.name}
              {!row.wholeSection && <> · {row.studentCount} {row.studentCount === 1 ? 'student' : 'students'}</>}
              {row.maxMarks ? <> · out of {row.maxMarks}</> : null}
            </p>
            {row.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.description}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-navy">Due {shortDay(row.dueDate)}</p>
            {!parentView && p && (
              <p className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-500">
                <Users size={12} /> {p.submitted + p.reviewed}/{p.students} handed in
                {p.toReview > 0 && <Badge tone="warning">{p.toReview} to review</Badge>}
              </p>
            )}
          </div>
        </div>
        {parentView && row.children && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {row.children.map((c) => (
              <li key={c.studentId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200">
                <span className="font-semibold text-navy">{c.name}</span>
                <Badge tone={SUBMISSION_TONES[c.status]}>{SUBMISSION_LABELS[c.status]}</Badge>
                {c.marks !== null && <span className="text-slate-500">{c.marks}{row.maxMarks ? `/${row.maxMarks}` : ''}</span>}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );
}

function CourseworkView({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const params = useSearchParams();
  const { can } = useCan();
  const canCreate = can(copy.create);
  const parentView = !can('teaching.dashboard') && !can(copy.create);
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get('when')) ? (params.get('when') as string) : 'upcoming');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(params.get('new') === '1' && canCreate);
  const { data: options } = useTeachingOptions(!parentView);
  const status = tab === 'CANCELLED' ? 'CANCELLED' : undefined;
  const when = tab === 'upcoming' || tab === 'overdue' ? tab : undefined;
  const { data, isLoading, isError } = useCoursework(kind, { sectionId: sectionId || undefined, subjectId: subjectId || undefined, status, when, search: debounced || undefined, page, pageSize: 15 });

  const visibleTabs = parentView ? TABS.filter((t) => t.id !== 'CANCELLED' && t.id !== 'overdue') : TABS;
  const filtered = Boolean(sectionId || subjectId || debounced);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={parentView ? `${copy.title} set for your children’s classes.` : copy.description}
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> {kind === 'HOMEWORK' ? 'Set homework' : 'Add assignment'}
            </Button>
          ) : undefined
        }
      />

      <Tabs className="mt-6 w-fit max-w-full" value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={visibleTabs} />

      <div className={`${FILTER_PANEL} mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4`}>
        <div className="sm:col-span-2">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`Search ${copy.plural}…`} aria-label={`Search ${copy.plural}`} />
        </div>
        {!parentView && (
          <>
            <SelectField fieldSize="sm" aria-label="Class" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
              <option value="">All my classes</option>
              {options?.sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setPage(1); }}>
              <option value="">All subjects</option>
              {options?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          </>
        )}
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t load the {copy.plural}.</Alert>}
        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {data && data.data.length === 0 && (
          <EmptyState
            icon={filtered ? <SearchX size={22} /> : kind === 'HOMEWORK' ? <NotebookPen size={22} /> : <BookOpenCheck size={22} />}
            title={filtered ? 'Nothing matches' : tab === 'overdue' ? 'Nothing is past due' : `No ${copy.plural} here yet`}
            description={filtered ? 'Try a different class, subject or search.' : canCreate ? `Use “${kind === 'HOMEWORK' ? 'Set homework' : 'Add assignment'}” to set the first one.` : 'Nothing has been set yet.'}
          />
        )}
        <ul className="flex flex-col gap-3">
          {data?.data.map((row) => (
            <CourseworkCard key={row.id} kind={kind} row={row} parentView={parentView} />
          ))}
        </ul>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun={copy.plural} onPageChange={setPage} />
          </div>
        )}
      </div>

      {canCreate && <CreateDialog kind={kind} open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}

export function CourseworkList({ kind }: { kind: Kind }) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl" />}>
      <CourseworkView kind={kind} />
    </Suspense>
  );
}
