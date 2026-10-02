'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Avatar, Skeleton, PageHeader, Tabs } from '@schovexa/ui';
import { Award, Bell, BookOpen, Building2, CalendarCheck, CalendarDays, Clock, Coins, FileText, GraduationCap, Lock, PartyPopper, School, Shapes, Trophy } from 'lucide-react';
import { useCurrentSchool, type School as SchoolRecord } from '../../../../hooks/useCurrentSchool';
import { useGrading, useSchoolSettings } from '../../../../hooks/useSchoolSettings';
import { useCan } from '../../../../hooks/useCan';
import { API_URL } from '../../../../lib/api-client';
import { ProfileTab } from '../../../../components/settings/profile-tab';
import { TimingsTab } from '../../../../components/settings/timings-tab';
import { AttendanceTab, DocumentsTab, FeesTab, NotificationsTab } from '../../../../components/settings/rules-tabs';
import { GradingTab } from '../../../../components/settings/grading-tab';

type TabId = 'profile' | 'timings' | 'attendance' | 'fees' | 'notifications' | 'documents' | 'grading';

const TABS = [
  { id: 'profile', label: 'Profile', icon: <Building2 size={16} /> },
  { id: 'timings', label: 'Timings & days', icon: <Clock size={16} /> },
  { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} /> },
  { id: 'fees', label: 'Fees', icon: <Coins size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'documents', label: 'Documents', icon: <FileText size={16} /> },
  { id: 'grading', label: 'Grading', icon: <Award size={16} /> },
];

// The rest of "how the school is set up" lives on its own pages; one row of
// links keeps them findable from here.
const RELATED = [
  { href: '/dashboard/academic-years', label: 'Academic years & terms', icon: CalendarDays },
  { href: '/dashboard/classes', label: 'Classes & sections', icon: School },
  { href: '/dashboard/subjects', label: 'Subjects', icon: BookOpen },
  { href: '/dashboard/departments', label: 'Departments', icon: Shapes },
  { href: '/dashboard/groups', label: 'Houses & groups', icon: Trophy },
  { href: '/dashboard/holidays', label: 'Holidays', icon: PartyPopper },
  { href: '/dashboard/calendar', label: 'School calendar', icon: GraduationCap },
];

export default function SchoolSettingsPage() {
  const { data: school, isError } = useCurrentSchool();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Administration" title="School Settings" description="Your school’s profile, week, rules and how it communicates." />
      {isError && <Alert variant="error">We couldn’t load your school’s settings. Please refresh and try again.</Alert>}
      {!school && !isError && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {school && <Settings school={school} />}
    </div>
  );
}

function Settings({ school }: { school: SchoolRecord }) {
  const { can } = useCan();
  const canEdit = can('school.update');
  const [tab, setTab] = useState<TabId>('profile');
  const { data: settings, isError: settingsError } = useSchoolSettings();
  const { data: grading } = useGrading();

  return (
    <>
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-dark p-6 text-white shadow-elevated sm:p-7">
        <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 animate-blob rounded-full bg-brand-electric/30 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          {school.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie, so next/image can't fetch it
            <img src={`${API_URL}/schools/me/logo?v=${encodeURIComponent(school.updatedAt)}`} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1 ring-2 ring-white/40" />
          ) : (
            <Avatar name={school.name} tone="auto" size={64} ring />
          )}
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold tracking-tight">{school.name}</p>
            {school.motto && <p className="truncate text-sm italic text-white/70">“{school.motto}”</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {school.timezone}</span>
              <span className="inline-flex items-center gap-1.5"><Coins size={14} /> {school.currency}</span>
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Related setup" className="flex flex-wrap gap-2">
        {RELATED.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:text-brand-blue">
            <Icon size={14} /> {label}
          </Link>
        ))}
      </nav>

      {!canEdit && (
        <Alert variant="info">
          <span className="inline-flex items-center gap-2"><Lock size={15} /> You can view these settings, but your role can’t change them.</span>
        </Alert>
      )}

      <Tabs tabs={TABS} value={tab} onChange={(id) => setTab(id as TabId)} />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'profile' && <ProfileTab school={school} canEdit={canEdit} />}
        {tab !== 'profile' && tab !== 'grading' && settingsError && <Alert variant="error">We couldn’t load these settings. Please refresh.</Alert>}
        {tab !== 'profile' && tab !== 'grading' && !settings && !settingsError && <Skeleton className="h-64 rounded-2xl" />}
        {settings && tab === 'timings' && <TimingsTab school={school} settings={settings} canEdit={canEdit} />}
        {settings && tab === 'attendance' && <AttendanceTab settings={settings} canEdit={canEdit} />}
        {settings && tab === 'fees' && <FeesTab settings={settings} canEdit={canEdit} />}
        {settings && tab === 'notifications' && <NotificationsTab school={school} settings={settings} canEdit={canEdit} />}
        {settings && tab === 'documents' && <DocumentsTab settings={settings} canEdit={canEdit} />}
        {tab === 'grading' && (grading ? <GradingTab grading={grading} canEdit={canEdit} /> : <Skeleton className="h-64 rounded-2xl" />)}
      </div>
    </>
  );
}
