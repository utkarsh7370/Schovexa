'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createInvitationSchema, type CreateInvitationInput } from '@schovexa/validation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  Skeleton,
  StatCard,
  TextField,
  useToast,
  type BadgeTone,
} from '@schovexa/ui';
import { Download, Mail, MailCheck, SearchX, ShieldCheck, UserCheck, UserPlus2, UserX, Users } from 'lucide-react';
import { useMemberships, MEMBERSHIPS_QUERY_KEY, type Membership } from '../../../../hooks/useMemberships';
import { useRoles } from '../../../../hooks/useRoles';
import { useCurrentUser } from '../../../../hooks/useCurrentUser';
import { api, ApiError } from '../../../../lib/api-client';
import { InviteLinkPanel } from '../../../../components/invite-link-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const PAGE_SIZES = [12, 24, 48];

// "Invite pending" is not a membership status: an invited person already
// has an ACTIVE membership, and it is their *user* record that is still
// INVITED until they set a password. So the status shown here combines
// both — otherwise pending invites would read as fully "Active".
type StaffStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DISABLED';

function staffStatus(m: Membership): StaffStatus {
  if (m.status !== 'ACTIVE') return m.status;
  return m.user.status === 'INVITED' ? 'INVITED' : 'ACTIVE';
}

const STATUS_LABELS: Record<StaffStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invite pending',
  SUSPENDED: 'Suspended',
  DISABLED: 'Disabled',
};

const STATUS_TONES: Record<StaffStatus, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
  DISABLED: 'neutral',
};

const STATUS_BAR: Record<StaffStatus, string> = {
  ACTIVE: 'from-emerald-400 to-teal-500',
  INVITED: 'from-amber-300 to-orange-400',
  SUSPENDED: 'from-red-300 to-red-400',
  DISABLED: 'from-slate-200 to-slate-300',
};

// Suspended people are grouped with Disabled in the filter: both mean
// "can't sign in right now".
type Filter = 'ALL' | 'ACTIVE' | 'INVITED' | 'DISABLED';

function filterBucket(status: StaffStatus): Exclude<Filter, 'ALL'> {
  return status === 'SUSPENDED' ? 'DISABLED' : status;
}

export default function StaffPage() {
  const { data: memberships, isLoading, isError } = useMemberships();
  const { data: roles } = useRoles();
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string; name: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [confirmingDisable, setConfirmingDisable] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvitationInput>({ resolver: zodResolver(createInvitationSchema) });

  const closeForm = () => {
    setInviting(false);
    setServerError(null);
    reset();
  };

  const onInvite = async (data: CreateInvitationInput) => {
    setServerError(null);
    setInviteResult(null);
    try {
      const result = await api.post<{ userId: string; inviteToken: string }>('/memberships/invitations', data);
      await queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_QUERY_KEY });
      // The invite is emailed when SMTP is configured; the link is also
      // shown so the admin can share it directly as a fallback. This
      // token must never be logged (docs/logging.md §4); it only ever
      // appears in this one response, to this one caller.
      setInviteResult({
        link: `${window.location.origin}/accept-invite?token=${result.inviteToken}`,
        name: `${data.firstName} ${data.lastName}`,
      });
      toast.show({
        tone: 'success',
        title: 'Invitation sent',
        description: `${data.firstName} ${data.lastName} will get an email to set up their account.`,
      });
      closeForm();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not send invitation.');
    }
  };

  const disable = async () => {
    if (!confirmingDisable) return;
    setBusyMembershipId(confirmingDisable.id);
    try {
      await api.post(`/memberships/${confirmingDisable.id}/disable`);
      await queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_QUERY_KEY });
      toast.show({ tone: 'success', title: `${confirmingDisable.name}'s access was disabled` });
    } finally {
      setBusyMembershipId(null);
      setConfirmingDisable(null);
    }
  };

  const reactivate = async (membershipId: string, name: string) => {
    setBusyMembershipId(membershipId);
    try {
      await api.post(`/memberships/${membershipId}/reactivate`);
      await queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_QUERY_KEY });
      toast.show({ tone: 'success', title: `${name}'s access was restored` });
    } finally {
      setBusyMembershipId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { ALL: 0, ACTIVE: 0, INVITED: 0, DISABLED: 0 };
    (memberships ?? []).forEach((m) => {
      c.ALL += 1;
      c[filterBucket(staffStatus(m))] += 1;
    });
    return c;
  }, [memberships]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (memberships ?? []).filter((m) => {
      if (filter !== 'ALL' && filterBucket(staffStatus(m)) !== filter) return false;
      if (!words.length) return true;
      const haystack = `${m.user.firstName} ${m.user.lastName} ${m.user.email} ${m.role.name}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [memberships, query, filter]);

  useEffect(() => setPage(1), [query, filter, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'ALL', label: `All (${counts.ALL})` },
    { id: 'ACTIVE', label: `Active (${counts.ACTIVE})` },
    { id: 'INVITED', label: `Pending (${counts.INVITED})` },
    { id: 'DISABLED', label: `Disabled (${counts.DISABLED})` },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="People"
        title="Staff"
        description="Invite team members and manage who can access your school."
        action={
          <>
            <a
              href={`${API_URL}/memberships/export`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:bg-slate-50 hover:shadow-elevated"
            >
              <Download size={16} />
              Export CSV
            </a>
            <Button onClick={() => setInviting(true)}>
              <UserPlus2 size={16} /> Invite staff
            </Button>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Team members" tone="blue" icon={<Users size={18} />} value={memberships ? counts.ALL : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Active" tone="emerald" icon={<UserCheck size={18} />} value={memberships ? counts.ACTIVE : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Invite pending" tone="amber" icon={<MailCheck size={18} />} value={memberships ? counts.INVITED : <Skeleton className="h-8 w-12" />} hint="Haven’t set a password yet" />
        <StatCard label="Disabled" tone="default" icon={<UserX size={18} />} value={memberships ? counts.DISABLED : <Skeleton className="h-8 w-12" />} />
      </div>

      {inviteResult && <InviteLinkPanel link={inviteResult.link} name={inviteResult.name} />}

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card lg:flex-row lg:items-center">
        <SearchInput
          className="flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search staff by name, email or role…"
          aria-label="Search staff"
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="group" aria-label="Filter staff by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                filter === f.id ? 'bg-white text-navy shadow-card' : 'text-slate-500 hover:text-navy',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {isError && <Alert variant="error">We couldn’t load your team. Please refresh and try again.</Alert>}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && !isError && memberships?.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="No staff invited yet"
            description="Invite your teachers and administrators to give them access."
            action={<Button onClick={() => setInviting(true)}>Invite your first staff member</Button>}
          />
        )}

        {memberships && memberships.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={<SearchX size={22} />}
            title="No staff match"
            description="Try a different name, or change the filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('ALL');
                }}
              >
                Clear search
              </Button>
            }
          />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((m, i) => {
            const name = `${m.user.firstName} ${m.user.lastName}`;
            const status = staffStatus(m);
            return (
              <article
                key={m.membershipId}
                className="group animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/30 hover:shadow-elevated"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className={['h-1.5 bg-gradient-to-r', STATUS_BAR[status]].join(' ')} />
                <div className="p-5">
                  <div className="flex items-start gap-3.5">
                    <Avatar name={name} tone="auto" size={48} className="transition-transform duration-300 group-hover:scale-105" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-navy">{name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500">
                        <Mail size={13} className="shrink-0" /> <span className="truncate">{m.user.email}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">
                        <ShieldCheck size={12} /> {m.role.name}
                      </Badge>
                      <Badge tone={STATUS_TONES[status]} dot pulse={status === 'INVITED'}>
                        {STATUS_LABELS[status]}
                      </Badge>
                    </div>
                    {m.user.id === me?.id ? (
                      <span className="text-xs font-semibold text-slate-400">This is you</span>
                    ) : m.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="soft-danger"
                        loading={busyMembershipId === m.membershipId}
                        onClick={() => setConfirmingDisable({ id: m.membershipId, name })}
                      >
                        Disable
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" loading={busyMembershipId === m.membershipId} onClick={() => reactivate(m.membershipId, name)}>
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              noun={filtered.length === 1 ? 'team member' : 'team members'}
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
        open={inviting}
        onClose={closeForm}
        size="lg"
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Invite staff</span>}
        title="Invite a staff member"
        description="They’ll get an email with a link to set their own password."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={isSubmitting}>
              Send invitation
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={handleSubmit(onInvite)} className="flex flex-col gap-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <TextField label="Email" type="email" leftIcon={<Mail size={16} />} placeholder="name@school.org" error={errors.email?.message} {...register('email')} />
          <SelectField label="Role" leftIcon={<ShieldCheck size={16} />} error={errors.roleId?.message} {...register('roleId')}>
            <option value="">Select a role</option>
            {roles?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </SelectField>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmingDisable}
        title={`Disable ${confirmingDisable?.name ?? 'this account'}?`}
        description="They will no longer be able to log in until you reactivate their account. Their records stay untouched."
        confirmLabel="Disable access"
        tone="danger"
        loading={busyMembershipId === confirmingDisable?.id}
        onConfirm={disable}
        onCancel={() => setConfirmingDisable(null)}
      />
    </div>
  );
}
