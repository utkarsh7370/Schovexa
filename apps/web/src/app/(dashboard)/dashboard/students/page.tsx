'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createStudentSchema } from '@schovexa/validation';
import {
  Button,
  Alert,
  Dialog,
  EmptyState,
  Pagination,
  PageHeader,
  SearchInput,
  SelectField,
  TextField,
  useToast,
} from '@schovexa/ui';
import { FilterX, GraduationCap, School, SearchX, Shapes, UserPlus2, Users, X } from 'lucide-react';
import { useStudentsPage, STUDENTS_QUERY_KEY } from '../../../../hooks/useStudents';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useTeachers } from '../../../../hooks/useTeachers';
import { api, ApiError } from '../../../../lib/api-client';
import { StudentCard, StudentCardSkeleton, STUDENT_STATUS_LABELS } from '../../../../components/student-card';

// sectionId is chosen via a class -> section cascade in this form, but
// the API only takes a flat sectionId — this local schema mirrors the
// shared one so the resolver validates exactly what the form collects.
const studentFormSchema = createStudentSchema;
type StudentFormInput = z.infer<typeof studentFormSchema>;

const PAGE_SIZES = [12, 24, 48];
const SEARCH_DEBOUNCE_MS = 300;

// Filters, search text and page live in the URL (?q=&classId=&page=…) —
// not component state — so a filtered view survives refresh, can be
// bookmarked or shared, and the header's global search can deep-link
// straight into a result list.
function StudentsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const q = searchParams.get('q') ?? '';
  const classId = searchParams.get('classId') ?? '';
  const sectionId = searchParams.get('sectionId') ?? '';
  const classTeacherId = searchParams.get('classTeacherId') ?? '';
  const status = searchParams.get('status') ?? '';
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : PAGE_SIZES[0];
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!keepPage) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Typing updates a local draft instantly; the URL (and so the request)
  // follows 300ms after the last keystroke. `lastPushed` stops the URL →
  // draft sync below from overwriting text typed while a push was in flight.
  const [draft, setDraft] = useState(q);
  const lastPushed = useRef(q);
  useEffect(() => {
    if (draft === q) return;
    const timer = window.setTimeout(() => {
      lastPushed.current = draft;
      update({ q: draft.trim() || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setDraft(q);
    }
  }, [q]);

  const { data, isLoading, isFetching, isError } = useStudentsPage({
    page,
    pageSize,
    search: q || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    classTeacherId: classTeacherId || undefined,
    status: status || undefined,
  });
  const { data: classes } = useClasses();
  const { data: sections } = useSections(classId || undefined);
  const { data: teachers } = useTeachers();

  // If a filter change (or a deleted student) leaves us past the last
  // page, jump back rather than show an empty page 7 of 3.
  useEffect(() => {
    if (data && page > data.totalPages) update({ page: String(data.totalPages) }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page]);

  const activeFilters = [
    q && { key: 'q', label: `“${q}”`, clear: () => { setDraft(''); lastPushed.current = ''; update({ q: undefined }); } },
    classId && { key: 'classId', label: classes?.find((c) => c.id === classId)?.name ?? 'Class', clear: () => update({ classId: undefined, sectionId: undefined }) },
    sectionId && { key: 'sectionId', label: `Section ${sections?.find((s) => s.id === sectionId)?.name ?? ''}`.trim(), clear: () => update({ sectionId: undefined }) },
    classTeacherId && {
      key: 'classTeacherId',
      label: (() => {
        const t = teachers?.find((x) => x.id === classTeacherId);
        return t ? `Teacher: ${t.user.firstName} ${t.user.lastName}` : 'Class teacher';
      })(),
      clear: () => update({ classTeacherId: undefined }),
    },
    status && { key: 'status', label: STUDENT_STATUS_LABELS[status] ?? status, clear: () => update({ status: undefined }) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAll = () => {
    setDraft('');
    lastPushed.current = '';
    router.replace(pathname, { scroll: false });
  };

  // ---- New admission dialog -------------------------------------------
  const [creating, setCreating] = useState(false);
  const [formClassId, setFormClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: formSections } = useSections(formClassId || undefined);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormInput>({ resolver: zodResolver(studentFormSchema) });

  const closeForm = () => {
    setCreating(false);
    setFormClassId('');
    setServerError(null);
    reset();
  };

  const onCreate = async (values: StudentFormInput) => {
    setServerError(null);
    try {
      const created = await api.post<{ firstName: string; lastName: string; admissionNo: string }>('/students', values);
      await queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY });
      closeForm();
      toast.show({
        tone: 'success',
        title: `${created.firstName} ${created.lastName} added`,
        description: `Admission no. ${created.admissionNo}`,
      });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create student.');
    }
  };

  const total = data?.total ?? 0;
  const hasFilters = activeFilters.length > 0;
  const noStudentsAtAll = !isLoading && !isError && total === 0 && !hasFilters;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="People"
        title="Students"
        description={
          data
            ? hasFilters
              ? `${total} ${total === 1 ? 'student matches' : 'students match'} your filters.`
              : `${total} ${total === 1 ? 'student' : 'students'} enrolled at your school.`
            : 'Everyone enrolled at your school, in one place.'
        }
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus2 size={16} /> New admission
          </Button>
        }
      />

      {/* Search + filters ------------------------------------------------ */}
      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <SearchInput
          value={draft}
          onChange={setDraft}
          busy={isFetching && !isLoading}
          placeholder="Search by student name, admission no., class, section or parent name / phone…"
          aria-label="Search students"
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            fieldSize="sm"
            aria-label="Filter by class"
            leftIcon={<School size={16} />}
            value={classId}
            onChange={(e) => update({ classId: e.target.value || undefined, sectionId: undefined })}
          >
            <option value="">All classes</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            fieldSize="sm"
            aria-label="Filter by section"
            leftIcon={<Shapes size={16} />}
            value={sectionId}
            disabled={!classId}
            onChange={(e) => update({ sectionId: e.target.value || undefined })}
          >
            <option value="">{classId ? 'All sections' : 'Pick a class first'}</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </SelectField>
          {/* Hidden for roles that cannot list teachers (the request just 403s). */}
          {teachers && (
            <SelectField
              fieldSize="sm"
              aria-label="Filter by class teacher"
              leftIcon={<GraduationCap size={16} />}
              value={classTeacherId}
              onChange={(e) => update({ classTeacherId: e.target.value || undefined })}
            >
              <option value="">All class teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.firstName} {t.user.lastName}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            fieldSize="sm"
            aria-label="Filter by status"
            leftIcon={<Users size={16} />}
            value={status}
            onChange={(e) => update({ status: e.target.value || undefined })}
          >
            <option value="">Any status</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active</span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                className="group inline-flex animate-fade-in items-center gap-1.5 rounded-full bg-brand-blue/10 py-1 pl-3 pr-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20"
                aria-label={`Remove filter ${f.label}`}
              >
                {f.label}
                <X size={13} className="transition-transform group-hover:rotate-90" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-navy"
            >
              <FilterX size={14} /> Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results --------------------------------------------------------- */}
      <div className="mt-6" aria-live="polite">
        {isError && <Alert variant="error">We couldn’t load students. Please refresh and try again.</Alert>}

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <StudentCardSkeleton key={i} />
            ))}
          </div>
        )}

        {noStudentsAtAll && (
          <EmptyState
            icon={<Users size={22} />}
            title="No students yet"
            description="Add your first student to start tracking attendance, fees, and records."
            action={<Button onClick={() => setCreating(true)}>Add a student</Button>}
          />
        )}

        {!isLoading && !isError && total === 0 && hasFilters && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No students match"
            description="Try a different name, or remove some of the filters."
            action={
              <Button variant="secondary" onClick={clearAll}>
                Clear all filters
              </Button>
            }
          />
        )}

        {data && data.items.length > 0 && (
          <div
            className={[
              'grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3',
              isFetching ? 'opacity-70' : 'opacity-100',
            ].join(' ')}
          >
            {data.items.map((student, i) => (
              <StudentCard key={student.id} student={student} index={i} />
            ))}
          </div>
        )}

        {data && data.total > 0 && (
          <div className="mt-6">
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              noun={data.total === 1 ? 'student' : 'students'}
              pageSizeOptions={PAGE_SIZES}
              onPageChange={(p) => {
                update({ page: p === 1 ? undefined : String(p) }, true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={(size) => update({ size: size === PAGE_SIZES[0] ? undefined : String(size) })}
            />
          </div>
        )}
      </div>

      {/* New admission ---------------------------------------------------- */}
      <Dialog
        open={creating}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New admission</span>}
        title="Admit a new student"
        description="A few basics to get started — you can add the rest later."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="admission-form" loading={isSubmitting}>
              Add student
            </Button>
          </>
        }
      >
        <form id="admission-form" onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Admission number" placeholder="A-001" error={errors.admissionNo?.message} {...register('admissionNo')} />
            <TextField label="Gender" placeholder="Optional" error={errors.gender?.message} {...register('gender')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <TextField label="Date of birth" type="date" helperText="Optional." error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Class"
              value={formClassId}
              onChange={(e) => {
                setFormClassId(e.target.value);
                setValue('sectionId', '');
              }}
            >
              <option value="">Not assigned yet</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Section" disabled={!formClassId} error={errors.sectionId?.message} {...register('sectionId')}>
              <option value="">Not assigned yet</option>
              {formSections?.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </SelectField>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// useSearchParams() needs a Suspense boundary for the App Router's
// static prerender (same pattern as reset-password / accept-invite).
export default function StudentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentsView />
    </Suspense>
  );
}
