'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createInvitationSchema, type CreateInvitationInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useMemberships, MEMBERSHIPS_QUERY_KEY } from '../../../../hooks/useMemberships';
import { useRoles } from '../../../../hooks/useRoles';
import { api, ApiError } from '../../../../lib/api-client';

export default function StaffPage() {
  const { data: memberships } = useMemberships();
  const { data: roles } = useRoles();
  const queryClient = useQueryClient();

  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);

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
      // No email delivery yet (docs/architecture.md §9, Phase 2) — the
      // real invite link is shown here so the admin can share it
      // directly. This token must never be logged (docs/logging.md §4);
      // it only ever appears in this one response, to this one caller.
      setInviteResult(`${window.location.origin}/accept-invite?token=${result.inviteToken}`);
      reset();
      setInviting(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not send invitation.');
    }
  };

  const disable = async (membershipId: string) => {
    setBusyMembershipId(membershipId);
    try {
      await api.post(`/memberships/${membershipId}/disable`);
      await queryClient.invalidateQueries({ queryKey: MEMBERSHIPS_QUERY_KEY });
    } finally {
      setBusyMembershipId(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Staff</h1>
          <p className="mt-1 text-slate-600">Invite staff and manage their access.</p>
        </div>
        {!inviting && <Button onClick={() => setInviting(true)}>Invite staff</Button>}
      </div>

      {inviting && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Invite a staff member</h2>
          <form onSubmit={handleSubmit(onInvite)} className="mt-4 flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
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

      {inviteResult && (
        <Alert variant="success" className="mt-4">
          <p>Invitation created. Share this link with them (no email delivery yet):</p>
          <code className="mt-2 block break-all rounded bg-white/60 px-2 py-1 text-xs text-green-900">
            {inviteResult}
          </code>
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {memberships?.map((m) => (
          <Card key={m.membershipId} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-navy">
                {m.user.firstName} {m.user.lastName}
              </p>
              <p className="text-sm text-slate-500">
                {m.user.email} · {m.role.name} ·{' '}
                <span
                  className={
                    m.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-400'
                  }
                >
                  {m.status}
                </span>
              </p>
            </div>
            {m.status === 'ACTIVE' ? (
              <Button
                size="sm"
                variant="danger"
                loading={busyMembershipId === m.membershipId}
                onClick={() => disable(m.membershipId)}
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
          </Card>
        ))}
      </div>
    </div>
  );
}
