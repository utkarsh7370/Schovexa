'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createNoticeSchema, type CreateNoticeInput } from '@schovexa/validation';
import { Badge, Button, Card, TextField, Alert, PageHeader, EmptyState, Skeleton, SkeletonRows, useToast } from '@schovexa/ui';
import { Bell } from 'lucide-react';
import { useNotices, NOTICES_QUERY_KEY, type NoticeAudience } from '../../../../hooks/useNotices';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useMemberships } from '../../../../hooks/useMemberships';
import { useCan } from '../../../../hooks/useCan';
import { useTeachingOptions } from '../../../../hooks/useTeaching';
import { api, ApiError } from '../../../../lib/api-client';
import { AUDIENCE_LABELS, NoticeCard, useNoticeViewer } from '../../../../components/notice-card';

function NoticesView() {
  const params = useSearchParams();
  const { can, canSchoolWide } = useCan();
  const canCreate = can('notice.create');
  const canPublish = can('notice.publish');
  // A teacher's notices go to the classes they teach; school-wide and individual notices come from the office.
  const schoolWide = canSchoolWide('notice.create');
  const { data: notices, isLoading } = useNotices();
  const { data: allClasses } = useClasses();
  const { data: teaching } = useTeachingOptions(canCreate && !schoolWide && can('teaching.dashboard'));
  const { data: memberships } = useMemberships({ enabled: schoolWide });
  const classes = useMemo(() => {
    if (schoolWide) return allClasses;
    const seen = new Map<string, string>();
    teaching?.sections.forEach((s) => seen.set(s.classId, s.className));
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [schoolWide, allClasses, teaching]);
  const queryClient = useQueryClient();
  const toast = useToast();
  const viewer = useNoticeViewer();
  const [creating, setCreating] = useState(params.get('new') === '1' && canCreate);
  const [audienceType, setAudienceType] = useState<NoticeAudience>(schoolWide ? 'ALL_SCHOOL' : 'SECTION');
  const [sendAt, setSendAt] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: allSections } = useSections(schoolWide ? selectedClassId || undefined : undefined);
  const sectionsForClass = schoolWide ? allSections : teaching?.sections.filter((s) => s.classId === selectedClassId).map((s) => ({ id: s.id, name: s.name.split(' – ').slice(1).join(' – ') || s.name }));

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateNoticeInput>({ resolver: zodResolver(createNoticeSchema), defaultValues: { audienceType: schoolWide ? 'ALL_SCHOOL' : 'SECTION' } });

  const onCreate = async (data: CreateNoticeInput) => {
    setServerError(null);
    try {
      let scheduledFor: string | undefined;
      if (sendAt) {
        const at = new Date(sendAt);
        if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
          setServerError('Choose a time in the future, or clear it to save a draft.');
          return;
        }
        scheduledFor = at.toISOString();
      }
      await api.post('/notices', { ...data, scheduledFor });
      await queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
      toast.show(scheduledFor ? { tone: 'success', title: 'Scheduled', description: `It goes out on ${new Date(scheduledFor).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` } : { tone: 'success', title: 'Draft saved', description: 'Publish it when you are ready for people to see it.' });
      reset();
      setAudienceType(schoolWide ? 'ALL_SCHOOL' : 'SECTION');
      setSendAt('');
      setSelectedClassId('');
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create notice.');
    }
  };

  const publish = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/notices/${id}/publish`);
      await queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
      toast.show({ tone: 'success', title: 'Notice published', description: 'The audience will see it on their dashboard now.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notices"
        description={schoolWide || !canCreate ? 'School announcements.' : 'School announcements, and updates for the classes you teach.'}
        action={canCreate && !creating && <Button onClick={() => setCreating(true)}>{schoolWide ? 'New notice' : 'Announce to my class'}</Button>}
      />

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <TextField label="Title" error={errors.title?.message} {...register('title')} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Body</label>
              <textarea
                rows={4}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                {...register('body')}
              />
              {errors.body && <p className="text-sm text-red-600">{errors.body.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Audience</label>
              <select
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                value={audienceType}
                onChange={(e) => {
                  const value = e.target.value as NoticeAudience;
                  setAudienceType(value);
                  setValue('audienceType', value);
                  setValue('audienceRefId', '');
                  setSelectedClassId('');
                }}
              >
                {(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).filter((a) => schoolWide || a === 'CLASS' || a === 'SECTION').map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>

            {audienceType === 'CLASS' && (
              <select
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                {...register('audienceRefId')}
              >
                <option value="">Select a class</option>
                {classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {audienceType === 'SECTION' && (
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setValue('audienceRefId', '');
                  }}
                >
                  <option value="">Select a class</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  disabled={!selectedClassId}
                  {...register('audienceRefId')}
                >
                  <option value="">Select a section</option>
                  {sectionsForClass?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {audienceType === 'INDIVIDUAL' && (
              <select
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                {...register('audienceRefId')}
              >
                <option value="">Select a person</option>
                {memberships?.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.firstName} {m.user.lastName} ({m.role.name})
                  </option>
                ))}
              </select>
            )}
            {errors.audienceRefId && <p className="text-sm text-red-600">{errors.audienceRefId.message}</p>}

            <TextField label="Send later (optional)" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} helperText="Leave empty to save a draft you publish yourself." />

            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Save draft
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
        {!isLoading && notices?.length === 0 && !creating && (
          <EmptyState icon={<Bell size={22} />} title="No notices yet" />
        )}
        {!isLoading && notices && notices.length > 0 && (
          <div className="flex flex-col gap-2">
            {notices.map((notice, i) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                onOpen={viewer.open}
                index={i}
                actions={
                  !notice.publishedAt && (
                    <span className="flex items-center gap-2">
                      {notice.scheduledFor && <Badge tone="info">Goes out {new Date(notice.scheduledFor).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Badge>}
                      {canPublish && (
                        <Button size="sm" loading={busyId === notice.id} onClick={() => publish(notice.id)}>
                          {notice.scheduledFor ? 'Send now' : 'Publish'}
                        </Button>
                      )}
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
      {viewer.dialog}
    </div>
  );
}

export default function NoticesPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-3xl" />}>
      <NoticesView />
    </Suspense>
  );
}
