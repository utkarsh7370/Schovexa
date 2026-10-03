'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, TextAreaField, TextField, useToast, type BadgeTone } from '@schovexa/ui';
import { ExternalLink, FileText, Library, Link2, Plus, SearchX, Video } from 'lucide-react';
import { useContent, useTeachingOptions, type ContentRow } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api, ApiError } from '../../lib/api-client';
import { FILTER_PANEL, RESULT_PANEL, formatDay } from '../finance/finance-ui';
import { FilePanel, useRefreshTeaching } from './teaching-ui';

const KIND_LABELS: Record<ContentRow['kind'], string> = { NOTE: 'Notes', PDF: 'PDF', VIDEO: 'Video', LINK: 'Link', WORKSHEET: 'Worksheet', PRACTICE: 'Practice questions' };
const STATUS_TONES: Record<ContentRow['status'], BadgeTone> = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' };
const STATUS_LABELS: Record<ContentRow['status'], string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };
const KIND_ICONS: Record<ContentRow['kind'], typeof FileText> = { NOTE: FileText, PDF: FileText, VIDEO: Video, LINK: Link2, WORKSHEET: FileText, PRACTICE: FileText };

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = useTeachingOptions(open);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState<ContentRow['kind']>('NOTE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useMemo(() => {
    if (!options || sectionIds.length === 0) return [];
    return options.subjects.filter((s) => sectionIds.every((id) => options.pairs.some((p) => p.sectionId === id && p.subjectId === s.id)));
  }, [options, sectionIds]);
  useEffect(() => {
    if (subjectId && !subjects.some((s) => s.id === subjectId)) setSubjectId('');
  }, [subjects, subjectId]);

  const save = async () => {
    setError(null);
    if (sectionIds.length === 0) return setError('Choose at least one class.');
    if (!subjectId) return setError('Choose a subject.');
    if (title.trim().length < 2) return setError('Give it a title.');
    setBusy(true);
    try {
      await api.post('/content', { sectionIds, subjectId, kind, title: title.trim(), description: description.trim() || undefined, url: url.trim() || undefined, publish });
      await refresh();
      toast.show({ tone: 'success', title: publish ? 'Published' : 'Saved as a draft', description: publish ? undefined : 'Open it to add files and publish when ready.' });
      setTitle('');
      setDescription('');
      setUrl('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Study material"
      title="Share study material"
      description="Notes, worksheets, videos and links for the classes you teach. Add PDF or image files after saving."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy}>{publish ? 'Publish' : 'Save draft'}</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-sm font-semibold text-navy">Classes</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options?.sections.map((s) => {
              const on = sectionIds.includes(s.id);
              return (
                <label key={s.id} className={['flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium', on ? 'border-brand-blue bg-brand-blue/10 text-brand-blue' : 'border-slate-200 text-slate-600'].join(' ')}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setSectionIds(on ? sectionIds.filter((x) => x !== s.id) : [...sectionIds, s.id])} />
                  {s.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Subject" value={subjectId} disabled={sectionIds.length === 0} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{sectionIds.length === 0 ? 'Choose a class first' : 'Choose a subject'}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
          <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as ContentRow['kind'])}>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField label="Description" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Link (optional)" type="url" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} helperText="A video or web page. Only http and https links are accepted." />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-navy">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Publish now (students’ parents can see it)
        </label>
      </div>
    </Dialog>
  );
}

function DetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data, isLoading } = useQuery({ queryKey: ['teaching', 'content-detail', id], queryFn: () => api.get<ContentRow>(`/content/${id}`), enabled: !!id });
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: ContentRow['status']) => {
    setBusy(true);
    try {
      await api.patch(`/content/${id}`, { status });
      await refresh();
      toast.show({ tone: 'success', title: status === 'PUBLISHED' ? 'Published' : status === 'ARCHIVED' ? 'Archived' : 'Moved to drafts' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!id}
      onClose={onClose}
      size="lg"
      title={data?.title ?? 'Study material'}
      description={data ? `${data.subject.name} · ${data.section.name} · ${KIND_LABELS[data.kind]}` : undefined}
      footer={
        data?.canEdit ? (
          <>
            {data.status !== 'ARCHIVED' && <Button variant="secondary" loading={busy} onClick={() => setStatus('ARCHIVED')}>Archive</Button>}
            {data.status === 'PUBLISHED' ? (
              <Button variant="secondary" loading={busy} onClick={() => setStatus('DRAFT')}>Unpublish</Button>
            ) : (
              <Button loading={busy} onClick={() => setStatus('PUBLISHED')}>Publish</Button>
            )}
          </>
        ) : undefined
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <Badge tone={STATUS_TONES[data.status]} className="w-fit">{STATUS_LABELS[data.status]}</Badge>
          {data.description && <p className="whitespace-pre-line text-sm text-slate-700">{data.description}</p>}
          {data.url && (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-2 rounded-xl bg-brand-blue/10 px-3 py-2 text-sm font-semibold text-brand-blue hover:bg-brand-blue/15">
              <ExternalLink size={14} /> Open link
            </a>
          )}
          <FilePanel
            basePath={`/content/${data.id}/files`}
            files={data.fileList ?? []}
            canEdit={data.canEdit && data.status !== 'ARCHIVED'}
            onChanged={async () => {
              await refresh();
            }}
            title="Files"
            hint={data.canEdit ? 'No files yet. Add a PDF or an image.' : 'No files.'}
          />
        </div>
      )}
    </Dialog>
  );
}

export function ContentView() {
  const { can } = useCan();
  const canCreate = can('content.create');
  const teaches = can('teaching.dashboard');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: options } = useTeachingOptions(teaches);
  const { data, isLoading, isError } = useContent({ sectionId: sectionId || undefined, subjectId: subjectId || undefined, kind: kind || undefined, status: status || undefined, search: debounced || undefined, page });
  const filtered = Boolean(sectionId || subjectId || kind || status || debounced);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Study material"
        description={canCreate ? 'Notes, worksheets, videos and links for your classes.' : 'Material shared by your children’s teachers.'}
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Share material
            </Button>
          ) : undefined
        }
      />

      <div className={`${FILTER_PANEL} mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4`}>
        <div className="sm:col-span-4 lg:col-span-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search material…" aria-label="Search study material" />
        </div>
        {teaches && (
          <>
            <SelectField fieldSize="sm" aria-label="Class" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
              <option value="">All classes</option>
              {options?.sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setPage(1); }}>
              <option value="">All subjects</option>
              {options?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          </>
        )}
        <SelectField fieldSize="sm" aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectField>
        {canCreate && (
          <SelectField fieldSize="sm" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        )}
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t load the study material.</Alert>}
        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {data && data.data.length === 0 && (
          <EmptyState icon={filtered ? <SearchX size={22} /> : <Library size={22} />} title={filtered ? 'Nothing matches' : 'No study material yet'} description={filtered ? 'Try different filters.' : canCreate ? 'Use “Share material” to add the first item.' : 'Nothing has been shared yet.'} />
        )}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data?.data.map((c) => {
            const Icon = KIND_ICONS[c.kind];
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)} className="flex h-full w-full items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition-colors hover:border-brand-blue/30 hover:bg-white">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-bold text-navy">
                      {c.title}
                      {canCreate && <Badge tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{c.subject.name} · {c.section.name} · {KIND_LABELS[c.kind]}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {c.publishedAt ? `Shared ${formatDay(c.publishedAt)}` : 'Not shared yet'}
                      {c.files > 0 ? ` · ${c.files} file${c.files === 1 ? '' : 's'}` : ''}
                      {c.url ? ' · link' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="items" onPageChange={setPage} />
          </div>
        )}
      </div>

      {canCreate && <CreateDialog open={creating} onClose={() => setCreating(false)} />}
      <DetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
