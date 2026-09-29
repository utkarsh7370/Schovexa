'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Badge, Button, EmptyState, Skeleton, StatCard, TextField, useToast } from '@schovexa/ui';
import { ArrowUpRight, GraduationCap, KeyRound, Mail, MailPlus, Phone, School, ShieldCheck, Users } from 'lucide-react';
import { useParent, parentQueryKey, PARENTS_QUERY_KEY } from '../../../../../hooks/useParents';
import { api, ApiError } from '../../../../../lib/api-client';
import { ProfileHero } from '../../../../../components/profile-hero';
import { SectionCard } from '../../../../../components/section-card';
import { InviteLinkPanel } from '../../../../../components/invite-link-panel';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../../../components/student-card';

export default function ParentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: parent, isLoading, isError } = useParent(id);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [inviting, setInviting] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t find this parent, or you don’t have access to their profile.</Alert>
        <Link href="/dashboard/parents" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
          ← Back to parents
        </Link>
      </div>
    );
  }

  if (isLoading || !parent) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" role="status" aria-label="Loading parent">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const fullName = `${parent.firstName} ${parent.lastName}`;
  const hasPortal = !!parent.userId;
  const emailMissing = !parent.email;

  const sendInvite = async () => {
    const email = emailDraft.trim();
    if (emailMissing && !/^\S+@\S+\.\S+$/.test(email)) {
      setInviteError('Enter a valid email address to send the invitation to.');
      return;
    }
    setInviteError(null);
    setBusy(true);
    try {
      const result = await api.post<{ userId: string; inviteToken: string | null }>(`/parents/${parent.id}/invite`, {
        ...(email ? { email } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: parentQueryKey(parent.id) });
      await queryClient.invalidateQueries({ queryKey: PARENTS_QUERY_KEY });
      setInviting(false);
      setEmailDraft('');
      toast.show({
        tone: 'success',
        title: result.inviteToken ? 'Invitation sent' : 'Parent linked to portal',
        description: result.inviteToken
          ? 'They will get an email to set up their portal login.'
          : 'They can log in with their existing password.',
      });
      // No token means this email already had an active portal login (a
      // sibling's parent invited earlier) — the record was just linked to
      // it, nothing more for the admin to share.
      setInviteLink(result.inviteToken ? `${window.location.origin}/accept-invite?token=${result.inviteToken}` : null);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not invite this parent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHero
        backHref="/dashboard/parents"
        backLabel="Back to parents"
        name={fullName}
        subtitle="Parent / Guardian"
        badges={
          <Badge tone={hasPortal ? 'success' : 'neutral'} dot className="bg-white/95">
            {hasPortal ? 'Portal login active' : 'No portal login'}
          </Badge>
        }
        chips={[
          parent.phone && { icon: <Phone size={14} />, label: parent.phone },
          parent.email && { icon: <Mail size={14} />, label: parent.email },
          { icon: <Users size={14} />, label: `${parent.children.length} ${parent.children.length === 1 ? 'child' : 'children'}` },
        ].filter(Boolean) as { icon: React.ReactNode; label: string }[]}
        actions={
          !hasPortal &&
          !inviting && (
            <Button
              variant="secondary"
              onClick={() => {
                setInviting(true);
                setInviteLink(null);
                setInviteError(null);
              }}
            >
              <MailPlus size={16} /> Invite to portal
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Children at school" tone="blue" icon={<Users size={18} />} value={parent.children.length} hint={parent.children.some((c) => c.isPrimary) ? 'Primary contact for at least one' : undefined} />
        <StatCard label="Portal access" tone={hasPortal ? 'emerald' : 'amber'} icon={<KeyRound size={18} />} value={hasPortal ? 'Active' : 'Not set up'} hint={hasPortal ? 'Can log in to view records' : 'Invite them to get started'} />
        <StatCard
          label="Contact details"
          tone={parent.phone && parent.email ? 'violet' : 'amber'}
          icon={<ShieldCheck size={18} />}
          value={parent.phone && parent.email ? 'Complete' : parent.phone ? 'Phone only' : parent.email ? 'Email only' : 'Missing'}
          hint={parent.phone && parent.email ? 'Phone and email on file' : 'Add the missing details if you can'}
        />
      </div>

      {(inviting || inviteLink) && (
        <SectionCard icon={<MailPlus size={18} />} title="Invite to the parent portal" description="They’ll get an email to set their own password.">
          {inviting && (
            <div className="flex animate-fade-in-up flex-col gap-4">
              {inviteError && <Alert variant="error">{inviteError}</Alert>}
              {emailMissing ? (
                <TextField
                  label="Parent’s email"
                  type="email"
                  leftIcon={<Mail size={16} />}
                  placeholder="parent@example.com"
                  helperText="This parent has no email on file — enter the one to invite."
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  The invitation will be sent to <span className="font-semibold text-navy">{parent.email}</span>.
                </p>
              )}
              <div className="flex gap-2">
                <Button loading={busy} onClick={sendInvite}>
                  Send invitation
                </Button>
                <Button variant="secondary" onClick={() => setInviting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {inviteLink && <InviteLinkPanel link={inviteLink} name={fullName} />}
        </SectionCard>
      )}

      <SectionCard
        icon={<GraduationCap size={18} />}
        title="Children"
        description="Students this parent is linked to. Open one to see attendance, fees and documents."
      >
        {parent.children.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="No children linked yet"
            description="Open a student’s profile and use “Link parent” to connect them."
            action={
              <Link href="/dashboard/students" className="text-sm font-semibold text-brand-blue hover:underline">
                Go to students →
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {parent.children.map((link) => {
              const s = link.student;
              const name = `${s.firstName} ${s.lastName}`;
              return (
                <Link
                  key={link.id}
                  href={`/dashboard/students/${s.id}`}
                  className="group flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:bg-white hover:shadow-elevated"
                >
                  <Avatar name={name} tone="auto" size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-bold text-navy">
                      {name}
                      {link.isPrimary && <Badge tone="brand">Primary</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      <span className="font-medium">{link.relation}</span>
                      {s.section && (
                        <span className="inline-flex items-center gap-1">
                          <School size={11} /> {s.section.class.name} · {s.section.name}
                        </span>
                      )}
                    </p>
                    <div className="mt-2">
                      <Badge tone={STUDENT_STATUS_TONES[s.status] ?? 'neutral'} dot>
                        {STUDENT_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </div>
                  </div>
                  <ArrowUpRight size={18} className="shrink-0 text-slate-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-blue" />
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
