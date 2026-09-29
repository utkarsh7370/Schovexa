'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createInvitationSchema, type CreateInvitationInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, Badge, ConfirmDialog, useToast, type BadgeTone } from '@schovexa/ui';
import { UserPlus2, Users, Download } from 'lucide-react';
import { useMemberships, MEMBERSHIPS_QUERY_KEY } from '../../../../hooks/useMemberships';
import { useRoles } from '../../../../hooks/useRoles';
import { api, ApiError } from '../../../../lib/api-client';
import { InviteLinkPanel } from '../../../../components/invite-link-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited — pending',
  DISABLED: 'Disabled',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DISABLED: 'neutral',
};

export default function StaffPage() {
  const { data: memberships } = useMemberships();
  const { data: roles } = useRoles();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [confirmingDisable, setConfirmingDisable] = useState<{ id: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvitationInput>({ resolver: zodResolver(createInvitationSchema) });

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
      setInviteResult(`${window.location.origin}/accept-invite?token=${result.inviteToken}`);
      toast.show({
        tone: 'success',
        title: 'Invitation sent',
        description: `${data.firstName} ${data.lastName} will get an email to set up their account.`,
      });
      reset();
      setInviting(false);
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

  const reactivate = async (membershipId: string) => {
    setBusyMembershipId(membershipId);
    try {
      await api.post(`/memberships/${membershipId}/reactivate`);
      await queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_QUERY_KEY });
    } finally {
      setBusyMembershipId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Staff"
        description="Invite team members and manage their access."
        action={
          <div className="flex items-center gap-2">
            <a
              href={`${API_URL}/memberships/export`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <Download size={15} strokeWidth={2} />
              Export CSV
            </a>
            {!inviting && (
              <Button onClick={() => setInviting(true)}>
                <UserPlus2 size={16} /> Invite staff
              </Button>
            )}
          </div>
        }
      />

      {inviting && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Invite a staff member</h2>
          <form onSubmit={handleSubmit(onInvite)} className="mt-4 flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy" htmlFor="roleId">
                Role
              </label>
              <select
                id="roleId"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                {...register('roleId')}
              >
                <option value="">Select a role</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {errors.roleId && <p className="text-sm text-red-600">{errors.roleId.message}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Send invite
              </Button>
              <Button type="button" variant="secondary" onClick={() => setInviting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {inviteResult && <InviteLinkPanel link={inviteResult} />}

      <div className="mt-6 flex flex-col gap-2">
        {memberships?.map((m) => (
          <Card key={m.membershipId} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-sm font-semibold text-brand-blue">
                {m.user.firstName[0]}
                {m.user.lastName[0]}
              </div>
              <div>
                <p className="font-medium text-navy">
                  {m.user.firstName} {m.user.lastName}
                </p>
                <p className="text-sm text-slate-500">
                  {m.user.email} · {m.role.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={STATUS_TONES[m.status] ?? 'neutral'}>{STATUS_LABELS[m.status] ?? m.status}</Badge>
              {m.status === 'ACTIVE' ? (
                <Button
                  size="sm"
                  variant="soft-danger"
                  loading={busyMembershipId === m.membershipId}
                  onClick={() => setConfirmingDisable({ id: m.membershipId, name: `${m.user.firstName} ${m.user.lastName}` })}
                >
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyMembershipId === m.membershipId}
                  onClick={() => reactivate(m.membershipId)}
                >
                  Reactivate
                </Button>
              )}
            </div>
          </Card>
        ))}
        {memberships?.length === 0 && !inviting && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-card">
              <Users size={22} />
            </div>
            <p className="font-semibold text-navy">No staff invited yet</p>
            <p className="max-w-sm text-sm text-slate-500">Invite your teachers and administrators to give them access.</p>
          </div>
        )}
      </div>

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
