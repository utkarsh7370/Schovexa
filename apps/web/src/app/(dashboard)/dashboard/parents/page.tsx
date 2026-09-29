'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createParentSchema, type CreateParentInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, Badge, EmptyState, SkeletonRows } from '@schovexa/ui';
import { UserRound } from 'lucide-react';
import { useParents, PARENTS_QUERY_KEY } from '../../../../hooks/useParents';
import { api, ApiError } from '../../../../lib/api-client';

export default function ParentsPage() {
  const { data: parents, isLoading } = useParents();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [invitingParentId, setInvitingParentId] = useState<string | null>(null);
  const [inviteEmailDraft, setInviteEmailDraft] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ parentId: string; link: string } | null>(null);
  const [busyParentId, setBusyParentId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateParentInput>({ resolver: zodResolver(createParentSchema) });

  const onCreate = async (data: CreateParentInput) => {
    setServerError(null);
    try {
      await api.post('/parents', data);
      await queryClient.invalidateQueries({ queryKey: PARENTS_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create parent profile.');
    }
  };

  const startInvite = (parentId: string) => {
    setInvitingParentId(parentId);
    setInviteEmailDraft('');
    setInviteError(null);
    setInviteResult(null);
  };

  const sendInvite = async (parentId: string, email: string) => {
    setInviteError(null);
    setBusyParentId(parentId);
    try {
      const result = await api.post<{ userId: string; inviteToken: string | null }>(`/parents/${parentId}/invite`, {
        ...(email ? { email } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: PARENTS_QUERY_KEY });
      setInvitingParentId(null);
      if (result.inviteToken) {
        setInviteResult({ parentId, link: `${window.location.origin}/accept-invite?token=${result.inviteToken}` });
      } else {
        // No token: this email already had an active portal login (e.g.
        // a sibling's parent invited earlier) — this parent record was
        // just linked to it, nothing more for the admin to share.
        setInviteResult({ parentId, link: '' });
      }
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not invite this parent.');
    } finally {
      setBusyParentId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Parents"
        description="Parent and guardian contact records."
        action={!creating && <Button onClick={() => setCreating(true)}>New parent</Button>}
      />

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Phone" placeholder="Optional" error={errors.phone?.message} {...register('phone')} />
              <TextField label="Email" type="email" placeholder="Optional" error={errors.email?.message} {...register('email')} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-6">
        {isLoading && <SkeletonRows count={4} />}
        {!isLoading && parents?.length === 0 && !creating && (
          <EmptyState icon={<UserRound size={22} />} title="No parent profiles yet" />
        )}
        {!isLoading && parents && parents.length > 0 && (
          <div className="flex flex-col gap-2">
            {parents.map((parent) => (
              <Card key={parent.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-navy">
                      {parent.firstName} {parent.lastName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {[parent.phone, parent.email].filter(Boolean).join(' · ') || 'No contact info'}
                    </p>
                  </div>
                  {parent.userId ? (
                    <Badge tone="success">Portal login active</Badge>
                  ) : invitingParentId !== parent.id ? (
                    <Button size="sm" variant="secondary" onClick={() => startInvite(parent.id)}>
                      Invite to portal
                    </Button>
                  ) : null}
                </div>

                {invitingParentId === parent.id && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
                    {inviteError && <Alert variant="error">{inviteError}</Alert>}
                    {!parent.email && (
                      <TextField
                        label="Email"
                        type="email"
                        placeholder="parent@example.com"
                        value={inviteEmailDraft}
                        onChange={(e) => setInviteEmailDraft(e.target.value)}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={busyParentId === parent.id}
                        onClick={() => sendInvite(parent.id, inviteEmailDraft)}
                      >
                        Send invite
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setInvitingParentId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {inviteResult?.parentId === parent.id &&
                  (inviteResult.link ? (
                    <Alert variant="success" className="mt-4">
                      <p>
                        Invitation created. They&apos;ll also receive it by email if SMTP is configured — here&apos;s
                        the link too, for sharing directly:
                      </p>
                      <code className="mt-2 block break-all rounded bg-white/60 px-2 py-1 text-xs text-green-900">
                        {inviteResult.link}
                      </code>
                    </Alert>
                  ) : (
                    <Alert variant="success" className="mt-4">
                      This parent already has a portal login (linked via a sibling) — they can log in with their
                      existing password.
                    </Alert>
                  ))}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
