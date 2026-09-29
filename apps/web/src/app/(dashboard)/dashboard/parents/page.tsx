'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createParentSchema, type CreateParentInput } from '@schovexa/validation';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StatCard,
  TextField,
  useToast,
} from '@schovexa/ui';
import { KeyRound, SearchX, UserPlus2, UserRound, Users } from 'lucide-react';
import { useParents, PARENTS_QUERY_KEY } from '../../../../hooks/useParents';
import { api, ApiError } from '../../../../lib/api-client';
import { ParentCard } from '../../../../components/parent-card';

type Filter = 'all' | 'portal' | 'none';
const PAGE_SIZES = [12, 24, 48];

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All parents' },
  { id: 'portal', label: 'Portal active' },
  { id: 'none', label: 'No login yet' },
];

export default function ParentsPage() {
  const { data: parents, isLoading, isError } = useParents();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateParentInput>({ resolver: zodResolver(createParentSchema) });

  const closeForm = () => {
    setCreating(false);
    setServerError(null);
    reset();
  };

  const onCreate = async (data: CreateParentInput) => {
    setServerError(null);
    try {
      await api.post('/parents', data);
      await queryClient.invalidateQueries({ queryKey: PARENTS_QUERY_KEY });
      closeForm();
      toast.show({ tone: 'success', title: `${data.firstName} ${data.lastName} added`, description: 'Link them to a student from the student’s profile.' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create parent profile.');
    }
  };

  // The API returns every parent in one go (a school has hundreds, not
  // millions), so search / filter / paging happen here — instant, and
  // matching on the parent's own details *and* their children's names.
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (parents ?? []).filter((p) => {
      if (filter === 'portal' && !p.userId) return false;
      if (filter === 'none' && p.userId) return false;
      if (!words.length) return true;
      const haystack = [p.firstName, p.lastName, p.phone, p.email, ...p.children.map((c) => `${c.student.firstName} ${c.student.lastName}`)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [parents, query, filter]);

  useEffect(() => setPage(1), [query, filter, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const withPortal = parents?.filter((p) => p.userId).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="People"
        title="Parents"
        description="Parent and guardian contact records, and who can log in to the portal."
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus2 size={16} /> New parent
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Parents on record" tone="blue" icon={<Users size={18} />} value={parents ? parents.length : <Skeleton className="h-8 w-14" />} />
        <StatCard label="Portal logins active" tone="emerald" icon={<KeyRound size={18} />} value={parents ? withPortal : <Skeleton className="h-8 w-14" />} hint="Can see their children’s records" />
        <StatCard label="Awaiting an invite" tone="amber" icon={<UserRound size={18} />} value={parents ? parents.length - withPortal : <Skeleton className="h-8 w-14" />} hint="No portal login yet" />
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card md:flex-row md:items-center">
        <SearchInput
          className="flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search by parent name, phone, email or child’s name…"
          aria-label="Search parents"
        />
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Filter parents">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                filter === f.id ? 'bg-white text-navy shadow-card' : 'text-slate-500 hover:text-navy',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load parents. Please refresh and try again.</Alert>}

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && !isError && parents?.length === 0 && (
          <EmptyState
            icon={<UserRound size={22} />}
            title="No parent profiles yet"
            description="Add a parent, then link them to their child from the student’s profile."
            action={<Button onClick={() => setCreating(true)}>Add a parent</Button>}
          />
        )}

        {!isLoading && parents && parents.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No parents match"
            description="Try a different name, or change the filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear search
              </Button>
            }
          />
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((parent, i) => (
              <ParentCard key={parent.id} parent={parent} index={i} />
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              noun={filtered.length === 1 ? 'parent' : 'parents'}
              pageSizeOptions={PAGE_SIZES}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">New parent</span>}
        title="Add a parent or guardian"
        description="Phone and email are optional. You can invite them to the portal from their profile."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="parent-form" loading={isSubmitting}>
              Add parent
            </Button>
          </>
        }
      >
        <form id="parent-form" onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Phone" placeholder="Optional" error={errors.phone?.message} {...register('phone')} />
            <TextField label="Email" type="email" placeholder="Optional" error={errors.email?.message} {...register('email')} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
