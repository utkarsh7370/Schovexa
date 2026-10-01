'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFeeCategorySchema, type CreateFeeCategoryInput } from '@schovexa/validation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  Skeleton,
  StatCard,
  Tabs,
  TextField,
  useToast,
  type BadgeTone,
} from '@schovexa/ui';
import { BadgeIndianRupee, CalendarDays, Repeat, Coins, Layers, Plus, School, SearchX, Send, Tag, Tags, Users, Wallet } from 'lucide-react';
import {
  useFeeCategories,
  useFeeStructures,
  FEE_CATEGORIES_QUERY_KEY,
  feeStructuresQueryKey,
  useOutstandingFees,
  OUTSTANDING_QUERY_KEY,
} from '../../../../hooks/useFees';
import { useAcademicYears } from '../../../../hooks/useAcademicYears';
import { useClasses } from '../../../../hooks/useClasses';
import { useCan } from '../../../../hooks/useCan';
import { useClientPaging } from '../../../../hooks/useClientPaging';
import { formatMinor, majorToMinor } from '../../../../lib/currency';
import { api, ApiError } from '../../../../lib/api-client';
import { TABLE } from '../../../../lib/table-styles';

// The API speaks amountMinor (paise); this form collects a rupee amount
// from the user and converts it at submit time — see lib/currency.ts.
const structureFormSchema = z.object({
  feeCategoryId: z.string().min(1, 'Choose a category'),
  academicYearId: z.string().min(1, 'Choose an academic year'),
  classId: z.string().optional(),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be greater than zero'),
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
});
type StructureFormInput = z.input<typeof structureFormSchema>;
type StructureFormOutput = z.output<typeof structureFormSchema>;

const FREQUENCY_LABELS: Record<string, string> = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual' };
const FEE_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', WAIVED: 'Waived' };
const FEE_STATUS_TONES: Record<string, BadgeTone> = { PENDING: 'warning', PARTIALLY_PAID: 'info', PAID: 'success', WAIVED: 'neutral' };

type FeeTab = 'outstanding' | 'structures' | 'categories';

export default function FeesPage() {
  const { can } = useCan();
  const canCreate = can('fee.create');
  const { data: outstanding } = useOutstandingFees();
  const { data: structures } = useFeeStructures();
  const { data: categories } = useFeeCategories();
  const [tab, setTab] = useState<FeeTab>('outstanding');
  const [creating, setCreating] = useState<'category' | 'structure' | null>(null);

  const totalOutstanding = outstanding?.reduce((sum, r) => sum + r.balanceMinor, 0);
  const studentsWithDues = outstanding ? new Set(outstanding.map((r) => r.student.id)).size : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Money"
        title="Fees"
        description="Fee categories, the structures built from them, and who still owes what."
        action={
          canCreate && (
            <>
              <Button variant="secondary" onClick={() => setCreating('category')}>
                <Tag size={16} /> New category
              </Button>
              <Button onClick={() => setCreating('structure')}>
                <Plus size={16} /> New structure
              </Button>
            </>
          )
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" tone="amber" icon={<BadgeIndianRupee size={18} />} value={totalOutstanding === undefined ? <Skeleton className="h-8 w-24" /> : formatMinor(totalOutstanding)} hint="Across all unpaid fees" />
        <StatCard label="Students with dues" tone="violet" icon={<Users size={18} />} value={studentsWithDues ?? <Skeleton className="h-8 w-12" />} />
        <StatCard label="Fee structures" tone="blue" icon={<Layers size={18} />} value={structures ? structures.length : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Categories" tone="emerald" icon={<Tags size={18} />} value={categories ? categories.length : <Skeleton className="h-8 w-12" />} />
      </div>

      <Tabs
        className="mt-6 w-fit max-w-full"
        value={tab}
        onChange={(v) => setTab(v as FeeTab)}
        tabs={[
          { id: 'outstanding', label: 'Outstanding', icon: <Wallet size={16} />, count: outstanding?.length },
          { id: 'structures', label: 'Structures', icon: <Layers size={16} />, count: structures?.length },
          { id: 'categories', label: 'Categories', icon: <Tags size={16} />, count: categories?.length },
        ]}
      />

      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6 animate-fade-in-up">
        {tab === 'outstanding' && <OutstandingPanel />}
        {tab === 'structures' && <StructuresPanel canCreate={canCreate} onNew={() => setCreating('structure')} />}
        {tab === 'categories' && <CategoriesPanel canCreate={canCreate} onNew={() => setCreating('category')} />}
      </div>

      <CategoryDialog open={creating === 'category'} onClose={() => setCreating(null)} />
      <StructureDialog open={creating === 'structure'} onClose={() => setCreating(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

type SortKey = 'balance-desc' | 'balance-asc' | 'name';

function OutstandingPanel() {
  const { data: outstanding, isLoading, isError } = useOutstandingFees();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<SortKey>('balance-desc');

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    outstanding?.forEach((r) => map.set(r.feeCategory.id, r.feeCategory.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [outstanding]);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (outstanding ?? [])
      .filter((r) => {
        if (categoryId && r.feeCategory.id !== categoryId) return false;
        if (status && r.status !== status) return false;
        if (!words.length) return true;
        const haystack = `${r.student.firstName} ${r.student.lastName} ${r.student.admissionNo} ${r.feeCategory.name}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .sort((a, b) =>
        sort === 'name'
          ? `${a.student.firstName} ${a.student.lastName}`.localeCompare(`${b.student.firstName} ${b.student.lastName}`)
          : sort === 'balance-asc'
            ? a.balanceMinor - b.balanceMinor
            : b.balanceMinor - a.balanceMinor,
      );
  }, [outstanding, search, categoryId, status, sort]);

  const paging = useClientPaging(filtered, `${search}|${categoryId}|${status}|${sort}`);
  const filteredTotal = filtered.reduce((sum, r) => sum + r.balanceMinor, 0);
  const filtersOn = !!(search || categoryId || status);

  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by student, admission number or fee category…" aria-label="Search outstanding fees" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField fieldSize="sm" aria-label="Filter by category" leftIcon={<Tag size={16} />} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </SelectField>
          <SelectField fieldSize="sm" aria-label="Filter by status" leftIcon={<Wallet size={16} />} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
          </SelectField>
          <SelectField fieldSize="sm" aria-label="Sort by" leftIcon={<Coins size={16} />} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="balance-desc">Highest balance first</option>
            <option value="balance-asc">Lowest balance first</option>
            <option value="name">Student name A–Z</option>
          </SelectField>
        </div>
        {filtersOn && outstanding && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? 'fee' : 'fees'} match — <span className="font-bold text-amber-600">{formatMinor(filteredTotal)}</span> outstanding
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        {isError && <Alert variant="error">We couldn’t load outstanding balances. Please try again.</Alert>}
        {isLoading && (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && outstanding?.length === 0 && <EmptyState icon={<Wallet size={22} />} title="Nothing outstanding" description="Every assigned fee has been paid or waived. Nice work." />}
        {outstanding && outstanding.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No fees match"
            description="Try clearing a filter or searching for something else."
            action={
              <Button variant="secondary" onClick={() => { setSearch(''); setCategoryId(''); setStatus(''); }}>
                Clear filters
              </Button>
            }
          />
        )}
        {filtered.length > 0 && (
          <>
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[46rem]`}>
                <thead className={TABLE.head}>
                  <tr>
                    <th className={TABLE.th}>Student</th>
                    <th className={TABLE.th}>Category</th>
                    <th className={TABLE.thRight}>Due</th>
                    <th className={TABLE.thRight}>Paid</th>
                    <th className={TABLE.thRight}>Balance</th>
                    <th className={TABLE.th}>Status</th>
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {paging.visible.map((row) => {
                    const name = `${row.student.firstName} ${row.student.lastName}`;
                    const pct = row.amountDueMinor > 0 ? Math.min(100, Math.round((row.paidMinor / row.amountDueMinor) * 100)) : 0;
                    return (
                      <tr key={row.id} className={TABLE.row}>
                        <td className={TABLE.td}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} tone="auto" size={32} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-navy">{name}</p>
                              <p className="font-mono text-[11px] text-slate-400">{row.student.admissionNo}</p>
                            </div>
                          </div>
                        </td>
                        <td className={`${TABLE.td} text-slate-600`}>{row.feeCategory.name}</td>
                        <td className={TABLE.tdRight}>{formatMinor(row.amountDueMinor)}</td>
                        <td className={TABLE.tdRight}>
                          <span className="font-semibold text-emerald-600">{formatMinor(row.paidMinor)}</span>
                          <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className={`${TABLE.tdRight} font-bold text-amber-600`}>{formatMinor(row.balanceMinor)}</td>
                        <td className={TABLE.td}>
                          <Badge tone={FEE_STATUS_TONES[row.status] ?? 'neutral'} dot>{FEE_STATUS_LABELS[row.status] ?? row.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={paging.page} totalPages={paging.totalPages} total={filtered.length} pageSize={paging.pageSize} noun="fees" pageSizeOptions={paging.sizes} onPageChange={paging.setPage} onPageSizeChange={paging.setPageSize} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function StructuresPanel({ canCreate, onNew }: { canCreate: boolean; onNew: () => void }) {
  const { data: structures, isLoading, isError } = useFeeStructures();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [frequency, setFrequency] = useState('');
  const [classId, setClassId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (structures ?? []).filter((s) => {
      if (frequency && s.frequency !== frequency) return false;
      if (classId === 'ALL' ? !!s.class : classId && s.class?.id !== classId) return false;
      if (!words.length) return true;
      const haystack = `${s.feeCategory.name} ${s.class?.name ?? 'all classes'} ${FREQUENCY_LABELS[s.frequency]}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [structures, search, frequency, classId]);

  const paging = useClientPaging(filtered, `${search}|${frequency}|${classId}`, [9, 18, 36]);

  const assign = async (id: string, label: string) => {
    setBusyId(id);
    try {
      const result = await api.post<{ assigned: number; alreadyAssigned: number }>(`/fee-structures/${id}/assign`);
      await queryClient.invalidateQueries({ queryKey: OUTSTANDING_QUERY_KEY });
      toast.show({
        tone: 'success',
        title: `${label} assigned`,
        description: `${result.assigned} ${result.assigned === 1 ? 'student' : 'students'} newly assigned${result.alreadyAssigned ? ` · ${result.alreadyAssigned} already had it` : ''}.`,
      });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not assign the fee', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search structures by category, class or frequency…" aria-label="Search fee structures" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField fieldSize="sm" aria-label="Filter by frequency" leftIcon={<Repeat size={16} />} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="">Any frequency</option>
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
          <SelectField fieldSize="sm" aria-label="Filter by class" leftIcon={<School size={16} />} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes &amp; school-wide</option>
            <option value="ALL">School-wide only</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
        </div>
      </div>

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load fee structures. Please try again.</Alert>}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && structures?.length === 0 && (
          <EmptyState icon={<Layers size={22} />} title="No fee structures yet" description="A structure sets how much a category costs, for which class, and how often." action={canCreate ? <Button onClick={onNew}>Create a structure</Button> : undefined} />
        )}
        {structures && structures.length > 0 && filtered.length === 0 && (
          <EmptyState icon={<SearchX size={22} />} title="No structures match" description="Try clearing a filter or searching for something else." action={<Button variant="secondary" onClick={() => { setSearch(''); setFrequency(''); setClassId(''); }}>Clear filters</Button>} />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paging.visible.map((s, i) => (
            <article key={s.id} className="group relative animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-elevated" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-gradient-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-navy">{s.feeCategory.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <School size={13} /> {s.class ? s.class.name : 'All classes'}
                  </p>
                </div>
                <Badge tone="brand">{FREQUENCY_LABELS[s.frequency]}</Badge>
              </div>
              <p className="relative mt-4 text-3xl font-extrabold tracking-tight text-navy">{formatMinor(s.amountMinor)}</p>
              {canCreate && (
                <Button className="relative mt-4 w-full" size="sm" variant="secondary" loading={busyId === s.id} onClick={() => assign(s.id, s.feeCategory.name)}>
                  <Send size={14} /> Assign to students
                </Button>
              )}
            </article>
          ))}
        </div>

        {filtered.length > 0 && (
          <div className="mt-6">
            <Pagination page={paging.page} totalPages={paging.totalPages} total={filtered.length} pageSize={paging.pageSize} noun="structures" pageSizeOptions={paging.sizes} onPageChange={paging.setPage} onPageSizeChange={paging.setPageSize} />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function CategoriesPanel({ canCreate, onNew }: { canCreate: boolean; onNew: () => void }) {
  const { data: categories, isLoading, isError } = useFeeCategories();
  const { data: structures } = useFeeStructures();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (categories ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [categories, search]);
  const paging = useClientPaging(filtered, search, [12, 24, 48]);

  return (
    <>
      {categories && categories.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories…" aria-label="Search fee categories" />
        </div>
      )}
      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load categories. Please try again.</Alert>}
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLoading && !isError && categories?.length === 0 && (
          <EmptyState icon={<Tags size={22} />} title="No categories yet" description="Categories group your fees — Tuition, Transport, Exam fee, and so on." action={canCreate ? <Button onClick={onNew}>Add a category</Button> : undefined} />
        )}
        {categories && categories.length > 0 && filtered.length === 0 && <EmptyState icon={<SearchX size={22} />} title="No categories match" description={`Nothing matches “${search}”.`} />}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {paging.visible.map((c, i) => {
            const uses = structures?.filter((s) => s.feeCategory.id === c.id).length ?? 0;
            return (
              <article key={c.id} className="animate-fade-in-up rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-card">
                  <Tag size={18} />
                </span>
                <p className="mt-3 truncate text-sm font-bold text-navy">{c.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{uses} {uses === 1 ? 'structure' : 'structures'}</p>
              </article>
            );
          })}
        </div>
        {filtered.length > paging.sizes[0] && (
          <div className="mt-6">
            <Pagination page={paging.page} totalPages={paging.totalPages} total={filtered.length} pageSize={paging.pageSize} noun="categories" pageSizeOptions={paging.sizes} onPageChange={paging.setPage} onPageSizeChange={paging.setPageSize} />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function CategoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeeCategoryInput>({ resolver: zodResolver(createFeeCategorySchema), mode: 'onTouched' });

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };

  const onSubmit = async (data: CreateFeeCategoryInput) => {
    setServerError(null);
    try {
      await api.post('/fee-categories', data);
      await queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY });
      toast.show({ tone: 'success', title: `${data.name} added`, description: 'Now create a fee structure that uses it.' });
      close();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create category.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New category</span>}
      title="Add a fee category"
      description="Categories group your fees — like Tuition, Transport or Exam fee."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="category-form" loading={isSubmitting}>Add category</Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <TextField label="Name" placeholder="Tuition" leftIcon={<Tag size={16} />} error={errors.name?.message} {...register('name')} />
      </form>
    </Dialog>
  );
}

function StructureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: years } = useAcademicYears();
  const { data: categories } = useFeeCategories();
  const { data: classes } = useClasses();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StructureFormInput, unknown, StructureFormOutput>({
    resolver: zodResolver(structureFormSchema),
    mode: 'onTouched',
    defaultValues: { frequency: 'MONTHLY', feeCategoryId: '', academicYearId: '', classId: '' },
  });

  const close = () => {
    setServerError(null);
    reset();
    onClose();
  };

  const onSubmit = async (data: StructureFormOutput) => {
    setServerError(null);
    try {
      await api.post('/fee-structures', {
        feeCategoryId: data.feeCategoryId,
        academicYearId: data.academicYearId,
        classId: data.classId || undefined,
        amountMinor: majorToMinor(data.amount),
        frequency: data.frequency,
      });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey() });
      toast.show({ tone: 'success', title: 'Fee structure created', description: 'Use “Assign to students” on it to bill students.' });
      close();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create fee structure.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New structure</span>}
      title="Create a fee structure"
      description="How much a category costs, for which class, and how often it is charged."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="structure-form" loading={isSubmitting}>Create structure</Button>
        </>
      }
    >
      <form id="structure-form" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Category" leftIcon={<Tag size={16} />} error={errors.feeCategoryId?.message} {...register('feeCategoryId')}>
            <option value="">Select a category</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField label="Academic year" leftIcon={<CalendarDays size={16} />} error={errors.academicYearId?.message} {...register('academicYearId')}>
            <option value="">Select a year</option>
            {years?.filter((y) => y.status === 'APPROVED').map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (current)' : ''}</option>
            ))}
          </SelectField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Class" leftIcon={<School size={16} />} {...register('classId')}>
            <option value="">All classes</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <TextField label="Amount (₹)" type="number" step="0.01" min="0" placeholder="0.00" error={errors.amount?.message} {...register('amount')} />
          <SelectField label="Frequency" leftIcon={<Repeat size={16} />} {...register('frequency')}>
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
      </form>
    </Dialog>
  );
}
