'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createNoticeSchema, type CreateNoticeInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, PageHeader, Badge, EmptyState, SkeletonRows } from '@schovexa/ui';
import { Bell } from 'lucide-react';
import { useNotices, NOTICES_QUERY_KEY, type NoticeAudience } from '../../../../hooks/useNotices';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useMemberships } from '../../../../hooks/useMemberships';
import { api, ApiError } from '../../../../lib/api-client';

const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  ALL_SCHOOL: 'Whole school',
  CLASS: 'A class',
  SECTION: 'A section',
  INDIVIDUAL: 'One person',
};

export default function NoticesPage() {
  const { data: notices, isLoading } = useNotices();
  const { data: classes } = useClasses();
  const { data: memberships } = useMemberships();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [audienceType, setAudienceType] = useState<NoticeAudience>('ALL_SCHOOL');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: sectionsForClass } = useSections(selectedClassId || undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateNoticeInput>({ resolver: zodResolver(createNoticeSchema), defaultValues: { audienceType: 'ALL_SCHOOL' } });

  const onCreate = async (data: CreateNoticeInput) => {
    setServerError(null);
    try {
      await api.post('/notices', data);
      await queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
      reset();
      setAudienceType('ALL_SCHOOL');
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
    } finally {
      setBusyId(null);
    }
  };

  const markRead = async (id: string) => {
    await api.post(`/notices/${id}/read`);
    await queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notices"
        description="School announcements."
        action={!creating && <Button onClick={() => setCreating(true)}>New notice</Button>}
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
                {(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).map((a) => (
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
            {notices.map((notice) => (
              <Card key={notice.id} className={['p-4', notice.isRead ? '' : 'border-brand-blue'].join(' ')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-navy">
                      {notice.title}
                      {!notice.isRead && <span className="ml-2 text-xs font-semibold text-brand-blue">NEW</span>}
                      {!notice.publishedAt && (
                        <Badge tone="neutral" className="ml-2">
                          Draft
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{notice.body}</p>
                    <p className="mt-2 text-xs text-slate-400">{AUDIENCE_LABELS[notice.audienceType]}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!notice.publishedAt && (
                      <Button size="sm" loading={busyId === notice.id} onClick={() => publish(notice.id)}>
                        Publish
                      </Button>
                    )}
                    {notice.publishedAt && !notice.isRead && (
                      <Button size="sm" variant="secondary" onClick={() => markRead(notice.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
