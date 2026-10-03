'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, Pagination, SelectField, Skeleton, Tabs, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { MessageSquare, Plus, Send } from 'lucide-react';
import { useMessageThread, useMessages, useTeachingOptions } from '../../hooks/useTeaching';
import { useStudents, useStudentsPage } from '../../hooks/useStudents';
import { useCan } from '../../hooks/useCan';
import { api, ApiError } from '../../lib/api-client';
import { formatDateTime } from '../finance/finance-ui';
import { useRefreshTeaching } from './teaching-ui';

const KINDS: Record<string, string> = { ANNOUNCEMENT: 'Class announcement', HOMEWORK: 'Homework notice', ASSIGNMENT: 'Assignment reminder', FEEDBACK: 'Academic feedback', STUDENT: 'About one student' };
const KIND_LABELS: Record<string, string> = { ...KINDS, QUERY: 'Question', REPLY: 'Reply' };

function ComposeDialog({ open, onClose, parent }: { open: boolean; onClose: () => void; parent: boolean }) {
  const toast = useToast();
  const refresh = useRefreshTeaching();
  const { data: options } = useTeachingOptions(open && !parent);
  const { data: children } = useStudents({ enabled: open && parent });
  const [kind, setKind] = useState('ANNOUNCEMENT');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aboutOne = !parent && kind === 'STUDENT';
  const { data: roster } = useStudentsPage({ page: 1, pageSize: 100, sectionId: aboutOne ? sectionId : '', status: 'ENROLLED' });

  const send = async () => {
    setError(null);
    if (subject.trim().length < 2) return setError('Add a subject line.');
    if (body.trim().length < 2) return setError('Write a message.');
    if (parent && !studentId) return setError('Choose which child this is about.');
    if (!parent && !sectionId) return setError('Choose a class.');
    if (aboutOne && !studentId) return setError('Choose the student.');
    setBusy(true);
    try {
      if (parent) {
        await api.post('/messages/query', { studentId, subject: subject.trim(), body: body.trim() });
        toast.show({ tone: 'success', title: 'Question sent', description: 'Your child’s teachers have been notified.' });
      } else {
        const result = await api.post<{ delivered: number; withoutPortalAccount: number }>('/messages', { kind, sectionId, studentId: aboutOne ? studentId : undefined, subject: subject.trim(), body: body.trim() });
        toast.show({ tone: 'success', title: 'Message sent', description: result.delivered > 0 ? `${result.delivered} ${result.delivered === 1 ? 'parent' : 'parents'} notified${result.withoutPortalAccount > 0 ? `; ${result.withoutPortalAccount} without a portal account.` : '.'}` : 'None of the parents has a portal account yet, so nobody was notified.' });
      }
      await refresh();
      setSubject('');
      setBody('');
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
      title={parent ? 'Ask a teacher' : 'New message to parents'}
      description={parent ? 'Your question goes to the teachers of your child’s class.' : 'Goes to the parents of the class or student you choose. Keep it about learning — fees are handled by the office.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} loading={busy}><Send size={14} /> Send</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        {parent ? (
          <SelectField label="About which child?" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Choose a child</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </SelectField>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Type" value={kind} onChange={(e) => { setKind(e.target.value); setStudentId(''); }}>
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectField>
            <SelectField label="Class" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setStudentId(''); }}>
              <option value="">Choose a class</option>
              {options?.sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
            {aboutOne && (
              <SelectField label="Student" value={studentId} disabled={!sectionId} onChange={(e) => setStudentId(e.target.value)} className="sm:col-span-2">
                <option value="">{sectionId ? 'Choose a student' : 'Choose a class first'}</option>
                {roster?.items.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </SelectField>
            )}
          </div>
        )}
        <TextField label="Subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
        <TextAreaField label="Message" rows={5} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Dialog>
  );
}

function Thread({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshTeaching();
  const { data, isLoading } = useMessageThread(id ?? undefined);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!id || reply.trim().length < 2) return;
    setBusy(true);
    try {
      // Replying to any message in the thread continues the thread.
      const last = data?.messages[data.messages.length - 1];
      await api.post(`/messages/${last?.id ?? id}/reply`, { body: reply.trim() });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['teaching', 'thread', id] });
      setReply('');
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not send the reply', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!id}
      onClose={() => {
        onClose();
        void queryClient.invalidateQueries({ queryKey: ['teaching', 'messages'] });
        void queryClient.invalidateQueries({ queryKey: ['teaching', 'unread-messages'] });
      }}
      size="lg"
      title={data?.subject ?? 'Message'}
    >
      {isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {data.messages.map((m) => (
              <li key={m.id} className={['max-w-[85%] rounded-2xl px-4 py-3 text-sm', m.mine ? 'self-end bg-brand-blue/10' : 'self-start bg-slate-100'].join(' ')}>
                <p className="text-xs font-semibold text-slate-500">
                  {m.mine ? 'You' : m.sender ?? 'Someone'} · {formatDateTime(m.createdAt)}
                  {m.kind !== 'REPLY' && <span className="ml-2 font-normal text-slate-400">{KIND_LABELS[m.kind] ?? ''}</span>}
                </p>
                <p className="mt-1 whitespace-pre-line text-navy">{m.body}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <TextAreaField label="Reply" rows={2} value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} />
            <Button className="self-end" size="sm" onClick={send} loading={busy} disabled={reply.trim().length < 2}>
              <Send size={14} /> Reply
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function MessagesView() {
  const { can } = useCan();
  const parent = !can('teaching.dashboard');
  const canSend = can('message.send');
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, isError } = useMessages(box, page);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description={parent ? 'Updates from your children’s teachers, and a way to ask them a question.' : 'Class updates, feedback and parent questions — all about learning, never about fees.'}
        action={
          canSend ? (
            <Button onClick={() => setComposing(true)}>
              <Plus size={16} /> {parent ? 'Ask a teacher' : 'New message'}
            </Button>
          ) : undefined
        }
      />
      <Tabs className="mt-6 w-fit" value={box} onChange={(v) => { setBox(v as 'inbox' | 'sent'); setPage(1); }} tabs={[{ id: 'inbox', label: 'Inbox' }, { id: 'sent', label: 'Sent' }]} />

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        {isError && <Alert variant="error">We couldn’t load your messages.</Alert>}
        {isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {data && data.data.length === 0 && <EmptyState icon={<MessageSquare size={22} />} title={box === 'inbox' ? 'Your inbox is empty' : 'Nothing sent yet'} description={box === 'inbox' ? 'Messages and replies will show up here.' : 'Messages you send will be listed here.'} />}
        <ul className="flex flex-col gap-2">
          {data?.data.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setOpenId(m.threadId)} className={['flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:border-brand-blue/30', m.unread ? 'border-brand-blue/30 bg-brand-blue/5' : 'border-slate-100 bg-slate-50/60'].join(' ')}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-bold text-navy">
                    {m.subject}
                    {m.unread && <Badge tone="info">New</Badge>}
                    <Badge tone="neutral">{KIND_LABELS[m.kind] ?? m.kind}</Badge>
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-slate-600">{m.preview}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {m.mine ? 'You' : m.sender ?? 'Someone'}{m.student ? ` · about ${m.student}` : ''} · {formatDateTime(m.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="messages" onPageChange={setPage} />
          </div>
        )}
      </div>

      {canSend && <ComposeDialog open={composing} onClose={() => setComposing(false)} parent={parent} />}
      <Thread id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
