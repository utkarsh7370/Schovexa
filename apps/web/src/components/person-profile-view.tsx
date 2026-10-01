'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, EmptyState, Skeleton, StatCard, Tabs, type BadgeTone } from '@schovexa/ui';
import { BookOpen, CalendarCheck, CalendarDays, FileText, GraduationCap, HeartPulse, Hash, IdCard, Layers, Mail, MapPin, Phone, ShieldCheck, User, UserRound, Users } from 'lucide-react';
import { ForbiddenState, NotFoundState } from './error-state';
import { InfoList } from './info-list';
import { PersonDocumentsPanel } from './person-documents-panel';
import { ProfileHero } from './profile-hero';
import { SectionCard } from './section-card';
import { ApiError } from '../lib/api-client';
import { useCan } from '../hooks/useCan';
import { staffProfileQueryKey, teacherProfileQueryKey, type PersonProfile } from '../hooks/useProfile';

const STATUS: Record<PersonProfile['status'], { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  DISABLED: { label: 'Disabled', tone: 'neutral' },
};
const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;

type TabId = 'overview' | 'teaching' | 'documents';

const formatDate = (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, options) : null;

export interface PersonProfileViewProps {
  profile: PersonProfile | undefined;
  isLoading: boolean;
  error: unknown;
  /** Which page this is: a teacher's page leads with teaching, a staff page with the role. */
  kind: 'teacher' | 'staff';
}

// One profile layout for teachers and other staff: banner, key numbers and
// tabs. A teacher's page adds the "Teaching" tab (class-teacher sections and
// subject assignments) and links across to the staff record, and vice versa.
export function PersonProfileView({ profile, isLoading, error, kind }: PersonProfileViewProps) {
  const { can } = useCan();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('overview');
  const backHref = kind === 'teacher' ? '/dashboard/teachers' : '/dashboard/staff';
  const backLabel = kind === 'teacher' ? 'Back to teachers' : 'Back to staff';

  if (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN') return <ForbiddenState />;
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return <NotFoundState signedIn />;
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t load this profile. Please refresh and try again.</Alert>
        <Link href={backHref} className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
          ← {backLabel}
        </Link>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" role="status" aria-label="Loading profile">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const { user, teacher } = profile;
  const fullName = `${user.firstName} ${user.lastName}`;
  const status = STATUS[profile.status];
  const canSeeDocs = can('user.view');
  const canManageDocs = can('user.update');

  const classes = new Set(teacher?.assignments.map((a) => a.section.class.id));
  const subjects = new Set(teacher?.assignments.map((a) => a.subjectId));
  const sections = new Set(teacher?.assignments.map((a) => a.sectionId));

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <User size={16} /> },
    ...(teacher ? [{ id: 'teaching', label: 'Teaching', icon: <BookOpen size={16} />, count: teacher.assignments.length || undefined }] : []),
    ...(canSeeDocs ? [{ id: 'documents', label: 'Documents', icon: <FileText size={16} />, count: profile.documentCount || undefined }] : []),
  ];

  const refreshCounts = () => {
    queryClient.invalidateQueries({ queryKey: staffProfileQueryKey(profile.membershipId) });
    if (teacher) queryClient.invalidateQueries({ queryKey: teacherProfileQueryKey(teacher.id) });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHero
        backHref={backHref}
        backLabel={backLabel}
        name={fullName}
        subtitle={teacher?.employeeCode ? `${profile.role.name} · ${teacher.employeeCode}` : profile.role.name}
        badges={
          <>
            <Badge tone="brand" className="!bg-white/15 !text-white !ring-white/25">
              <ShieldCheck size={12} /> {profile.role.name}
            </Badge>
            <Badge tone={status.tone} dot className="!bg-white/15 !text-white !ring-white/25">
              {user.status === 'INVITED' ? 'Invite pending' : status.label}
            </Badge>
            {teacher && kind === 'staff' && (
              <Badge tone="info" className="!bg-white/15 !text-white !ring-white/25">
                <GraduationCap size={12} /> Teacher
              </Badge>
            )}
          </>
        }
        chips={[
          { icon: <Mail size={13} />, label: user.email },
          ...(user.phone ? [{ icon: <Phone size={13} />, label: user.phone }] : []),
          ...(teacher?.joiningDate ? [{ icon: <CalendarDays size={13} />, label: `Joined ${formatDate(teacher.joiningDate, { month: 'short', year: 'numeric' })}` }] : []),
        ]}
        actions={
          teacher && kind === 'staff' ? (
            <Link href={`/dashboard/teachers/${teacher.id}`}>
              <Button size="sm" variant="secondary">
                <GraduationCap size={15} /> Teacher profile
              </Button>
            </Link>
          ) : kind === 'teacher' && can('user.view') ? (
            <Link href={`/dashboard/staff/${profile.membershipId}`}>
              <Button size="sm" variant="secondary">
                <IdCard size={15} /> Staff record
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className={['grid grid-cols-1 gap-4', teacher ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'].join(' ')}>
        {teacher ? (
          <>
            <StatCard label="Classes taught" tone="brand" icon={<Layers size={18} />} value={classes.size} hint={`${sections.size} section${sections.size === 1 ? '' : 's'}`} />
            <StatCard label="Subjects" tone="blue" icon={<BookOpen size={18} />} value={subjects.size} hint="Across all sections" />
            <StatCard label="Class teacher of" tone="emerald" icon={<Users size={18} />} value={teacher.classTeacherOf.length} hint={teacher.classTeacherOf.length ? 'Homeroom sections' : 'No homeroom yet'} />
            <StatCard label="Documents" tone="violet" icon={<FileText size={18} />} value={canSeeDocs ? profile.documentCount : '—'} hint="ID proof, certificates" />
          </>
        ) : (
          <>
            <StatCard label="Role" tone="brand" icon={<ShieldCheck size={18} />} value={profile.role.name} hint={status.label} />
            <StatCard label="Member since" tone="blue" icon={<CalendarCheck size={18} />} value={formatDate(profile.joinedAt, { month: 'short', year: 'numeric' })} hint={profile.school.name} />
            <StatCard label="Documents" tone="violet" icon={<FileText size={18} />} value={canSeeDocs ? profile.documentCount : '—'} hint="ID proof, certificates" />
          </>
        )}
      </div>

      <Tabs value={tab} onChange={(id) => setTab(id as TabId)} tabs={tabs} />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6">
        {tab === 'overview' && (
          <>
            <SectionCard icon={<User size={18} />} title="Personal details" description="Added by the person themselves from My profile.">
              <InfoList
                items={[
                  { icon: <Mail size={16} />, label: 'Email', value: user.email },
                  { icon: <Phone size={16} />, label: 'Phone', value: user.phone },
                  { icon: <CalendarDays size={16} />, label: 'Date of birth', value: formatDate(user.dateOfBirth) },
                  { icon: <UserRound size={16} />, label: 'Gender', value: user.gender ? GENDER[user.gender] : null },
                  ...(teacher
                    ? [
                        { icon: <Hash size={16} />, label: 'Employee code', value: teacher.employeeCode },
                        { icon: <CalendarCheck size={16} />, label: 'Joining date', value: formatDate(teacher.joiningDate) },
                      ]
                    : []),
                ]}
              />
              <div className="mt-3">
                <InfoList columns={1} items={[{ icon: <MapPin size={16} />, label: 'Address', value: user.address }]} />
              </div>
            </SectionCard>

            <SectionCard icon={<HeartPulse size={18} />} title="Emergency contact">
              <InfoList
                items={[
                  { icon: <User size={16} />, label: 'Name', value: user.emergencyContactName },
                  { icon: <Phone size={16} />, label: 'Phone', value: user.emergencyContactPhone },
                ]}
              />
            </SectionCard>

            {user.bio && (
              <SectionCard icon={<UserRound size={18} />} title="About">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{user.bio}</p>
              </SectionCard>
            )}
          </>
        )}

        {tab === 'teaching' && teacher && <TeachingPanel teacher={teacher} />}

        {tab === 'documents' && canSeeDocs && (
          <PersonDocumentsPanel
            basePath={`/staff/${profile.membershipId}/documents`}
            canUpload={canManageDocs}
            canDelete={canManageDocs}
            description="ID proof, certificates and contracts for this staff member."
            onChanged={refreshCounts}
          />
        )}
      </div>
    </div>
  );
}

function TeachingPanel({ teacher }: { teacher: NonNullable<PersonProfile['teacher']> }) {
  // Group "Maths · 7A, Maths · 7B" by class so a long timetable reads as a few blocks.
  const byClass = new Map<string, { name: string; rows: typeof teacher.assignments }>();
  for (const a of teacher.assignments) {
    const entry = byClass.get(a.section.class.id) ?? { name: a.section.class.name, rows: [] };
    entry.rows.push(a);
    byClass.set(a.section.class.id, entry);
  }

  return (
    <>
      <SectionCard icon={<Users size={18} />} title="Class teacher" description="Homeroom sections this teacher is responsible for.">
        {teacher.classTeacherOf.length === 0 ? (
          <p className="text-sm text-slate-500">Not the class teacher of any section.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teacher.classTeacherOf.map((s) => (
              <Badge key={s.id} tone="success">
                <Users size={12} /> {s.class.name} – {s.name}
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard icon={<BookOpen size={18} />} title="Subjects & sections" description="What this teacher teaches, and to whom.">
        {teacher.assignments.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No teaching assignments yet"
            description="Assign subjects and sections from the Teachers page."
            action={
              <Link href="/dashboard/teachers">
                <Button size="sm" variant="secondary">Go to Teachers</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...byClass.entries()].map(([classId, group]) => (
              <div key={classId} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-navy">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-brand-blue shadow-card">
                    <Layers size={14} />
                  </span>
                  {group.name}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {group.rows.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-700">{a.subject.name}</span>
                      <Badge tone="brand">Section {a.section.name}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
