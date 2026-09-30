'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createSubjectSchema, updateSubjectSchema, type CreateSubjectInput, type UpdateSubjectInput } from '@schovexa/validation';
import { Alert, Button, Dialog, EmptyState, PageHeader, SearchInput, Skeleton, StatCard, TextField, useToast } from '@schovexa/ui';
import { BookOpen, Hash, Pencil, Plus, SearchX, Tags } from 'lucide-react';
import { useSubjects, SUBJECTS_QUERY_KEY, type Subject } from '../../../../hooks/useSubjects';
import { api, ApiError } from '../../../../lib/api-client';

// A stable color per subject name, so "Mathematics" is always the same
// blue-ish tile and the grid reads as a colorful set, not identical boxes.
const TILE_COLORS = [
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-indigo-400 to-violet-600',
  'from-lime-400 to-emerald-600',
];

function tileFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

function badgeText(subject: Subject): string {
  return (subject.code || subject.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '•';
}

export default function SubjectsPage() {
  const { data: subjects, isLoading, isError } = useSubjects();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (subjects ?? []).filter((s) => {
      if (!words.length) return true;
      const haystack = `${s.name} ${s.code ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [subjects, query]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Subjects"
        description="The subjects taught at your school. Assign them to teachers and classes."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New subject
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Subjects" tone="blue" icon={<BookOpen size={18} />} value={subjects ? subjects.length : <Skeleton className="h-8 w-12" />} />
        <StatCard
          label="With a short code"
          tone="violet"
          icon={<Tags size={18} />}
          value={subjects ? subjects.filter((s) => s.code).length : <Skeleton className="h-8 w-12" />}
          hint="Codes like MATH or ENG keep timetables tidy"
        />
      </div>

      {subjects && subjects.length > 0 && (
        <div className="mt-6">
          <SearchInput value={query} onChange={setQuery} placeholder="Search subjects by name or code…" aria-label="Search subjects" />
        </div>
      )}

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load subjects. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && subjects?.length === 0 && (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No subjects yet"
            description="Add the subjects your school teaches, like Mathematics, English or Science."
            action={<Button onClick={() => setCreating(true)}>Add the first subject</Button>}
          />
        )}
        {subjects && subjects.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No subjects match"
            description={`Nothing matches “${query}”.`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((subject, i) => (
            <article
              key={subject.id}
              className="group relative animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-elevated"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-gradient-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex items-center gap-4">
                <span
                  className={['flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-extrabold tracking-wide text-white shadow-card transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3', tileFor(subject.name)].join(' ')}
                >
                  {badgeText(subject)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-navy">{subject.name}</p>
                  {subject.code ? (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                      <Hash size={11} /> {subject.code}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">No code</p>
                  )}
                </div>
                <Button size="sm" variant="secondary" aria-label={`Edit ${subject.name}`} onClick={() => setEditing(subject)}>
                  <Pencil size={14} /> Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
      <SubjectDialog open={!!editing} subject={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

// One dialog for both "new" and "edit" — same two fields, same layout,
// so they can't drift apart. `subject` present = edit.
function SubjectDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!subject;
  const formId = isEdit ? 'subject-edit-form' : 'subject-create-form';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSubjectInput | UpdateSubjectInput>({
    resolver: zodResolver(isEdit ? updateSubjectSchema : createSubjectSchema),
    // Re-key on the subject so opening a different one starts from its values.
    values: subject ? { name: subject.name, code: subject.code ?? '' } : { name: '', code: '' },
  });

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateSubjectInput | UpdateSubjectInput) => {
    setServerError(null);
    try {
      if (subject) await api.patch(`/subjects/${subject.id}`, data);
      else await api.post('/subjects', data);
      await queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY });
      toast.show({ tone: 'success', title: subject ? `${data.name ?? subject.name} updated` : `${data.name} added` });
      close();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : `Could not ${isEdit ? 'save' : 'create'} subject.`);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{isEdit ? 'Edit subject' : 'New subject'}</span>}
      title={isEdit ? `Edit ${subject.name}` : 'Add a subject'}
      description={isEdit ? undefined : 'Give it a name, and a short code if your school uses one.'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Add subject'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <TextField label="Name" placeholder="Mathematics" leftIcon={<BookOpen size={16} />} error={errors.name?.message} {...register('name')} />
        <TextField label="Code" placeholder="MATH" helperText="Optional." leftIcon={<Hash size={16} />} error={errors.code?.message} {...register('code')} />
      </form>
    </Dialog>
  );
}
