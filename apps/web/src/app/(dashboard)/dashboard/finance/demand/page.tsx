'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, PageHeader, Pagination, Skeleton, StatCard, Tabs, useToast } from '@schovexa/ui';
import { BadgeIndianRupee, BellRing, Download, FileText, MailWarning, Users } from 'lucide-react';
import { useDemand, useReminderLog } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { api, ApiError, downloadFile } from '../../../../../lib/api-client';
import { formatMinor } from '../../../../../lib/currency';
import { TABLE } from '../../../../../lib/table-styles';
import { useRefreshFinance } from '../../../../../components/finance/finance-dialogs';
import { ClassSectionFilters, FILTER_PANEL, RESULT_PANEL, formatDateTime, formatDay } from '../../../../../components/finance/finance-ui';

type Tab = 'demand' | 'log';
type Kind = 'DUE' | 'OUTSTANDING' | 'OVERDUE';
const KIND_LABELS: Record<Kind, string> = { DUE: 'Due reminder', OUTSTANDING: 'Outstanding-fee reminder', OVERDUE: 'Overdue reminder' };
const STATUS_TONES = { SENT: 'success', FAILED: 'danger', SKIPPED: 'neutral' } as const;
const CHANNEL_LABELS: Record<string, string> = { IN_APP: 'In-app', EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp' };

export default function FeeDemandPage() {
  const { can } = useCan();
  const toast = useToast();
  const refresh = useRefreshFinance();
  const [tab, setTab] = useState<Tab>('demand');
  const [cls, setCls] = useState({ classId: '', sectionId: '' });
  const { data, isLoading, isError } = useDemand({ classId: cls.classId || undefined, sectionId: cls.sectionId || undefined });
  const [sending, setSending] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);
  const { data: log } = useReminderLog(logPage);
  const hasFilter = !!(cls.classId || cls.sectionId);

  const send = async () => {
    if (!sending) return;
    setBusy(true);
    try {
      // A class or section is reminded as a group; with none chosen, every open fee of everyone who owes.
      const target = cls.sectionId
        ? { sectionId: cls.sectionId }
        : cls.classId
          ? { classId: cls.classId }
          : { studentFeeIds: (data?.data.flatMap((d) => d.fees.filter((f) => sending !== 'OVERDUE' || f.overdue).map((f) => f.id)) ?? []).slice(0, 300) };
      const result = await api.post<{ fees: number; parentsReached: number; parentsUnreachable: number; alreadyReminded: number }>('/finance/reminders', { kind: sending, ...target });
      await refresh();
      toast.show({
        tone: result.parentsReached > 0 ? 'success' : 'info',
        title: `${KIND_LABELS[sending]} sent`,
        description: `${result.fees} ${result.fees === 1 ? 'fee' : 'fees'} · ${result.parentsReached} ${result.parentsReached === 1 ? 'parent' : 'parents'} reached${result.parentsUnreachable ? ` · ${result.parentsUnreachable} couldn’t be reached` : ''}${result.alreadyReminded ? ` · ${result.alreadyReminded} already reminded today` : ''}`,
      });
      setSending(null);
      setTab('log');
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not send reminders', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const downloadDemand = async (studentId: string, name: string) => {
    setPdfBusy(studentId);
    try {
      await downloadFile(`/finance/demand/${studentId}/pdf`, `fee-demand-${name}.pdf`);
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not download the statement', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Finance"
        title="Fee demand & reminders"
        description="Who owes what right now, a printable statement for each family, and in-app / email reminders."
        action={
          can('feeNotice.send') && (
            <>
              <Button variant="secondary" onClick={() => setSending('OUTSTANDING')} disabled={!data || data.data.length === 0}>
                <BellRing size={16} /> Remind
              </Button>
              <Button variant="secondary" onClick={() => setSending('OVERDUE')} disabled={!data || data.totals.overdueMinor === 0}>
                <MailWarning size={16} /> Remind overdue
              </Button>
            </>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Students owing" tone="blue" icon={<Users size={18} />} value={data ? data.totals.students : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Total demand" tone="amber" icon={<BadgeIndianRupee size={18} />} value={data ? formatMinor(data.totals.totalMinor) : <Skeleton className="h-8 w-24" />} />
        <StatCard label="Of which overdue" tone="violet" icon={<MailWarning size={18} />} value={data ? formatMinor(data.totals.overdueMinor) : <Skeleton className="h-8 w-24" />} />
      </div>

      <Tabs className="mt-6 w-fit max-w-full" value={tab} onChange={(v) => setTab(v as Tab)} tabs={[{ id: 'demand', label: 'Demand', icon: <FileText size={16} />, count: data?.data.length }, { id: 'log', label: 'Reminder log', icon: <BellRing size={16} />, count: log?.total }]} />

      {tab === 'demand' && (
        <>
          <div className={`${FILTER_PANEL} mt-4`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ClassSectionFilters classId={cls.classId} sectionId={cls.sectionId} onChange={setCls} />
            </div>
            {data && <p className="mt-3 text-xs text-slate-400">As of {formatDay(data.asOf)}.</p>}
          </div>
          <div className={RESULT_PANEL}>
            {isError && <Alert variant="error">We couldn’t load the fee demand.</Alert>}
            {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
            {data && data.data.length === 0 && <EmptyState icon={<BadgeIndianRupee size={22} />} title="Nothing outstanding" description="Every fee is paid for this selection." />}
            {data && data.data.length > 0 && (
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[52rem]`}>
                  <thead className={TABLE.head}>
                    <tr>
                      <th className={TABLE.th}>Student</th>
                      <th className={TABLE.th}>Class</th>
                      <th className={TABLE.th}>Parent</th>
                      <th className={TABLE.th}>Fees owed</th>
                      <th className={TABLE.thRight}>Overdue</th>
                      <th className={TABLE.thRight}>Total</th>
                      <th className={TABLE.thRight}>Statement</th>
                    </tr>
                  </thead>
                  <tbody className={TABLE.body}>
                    {data.data.map((d) => (
                      <tr key={d.studentId} className={TABLE.row}>
                        <td className={TABLE.td}>
                          <Link href={`/dashboard/finance/students/${d.studentId}`} className="font-semibold text-navy hover:text-brand-blue">{d.name}</Link>
                          <span className="block font-mono text-[11px] text-slate-400">{d.admissionNo}</span>
                        </td>
                        <td className={`${TABLE.td} text-slate-600`}>{d.className ? `${d.className}${d.sectionName ? `-${d.sectionName}` : ''}` : '—'}</td>
                        <td className={`${TABLE.td} text-slate-600`}>{d.parentName ?? '—'}{d.parentPhone && <span className="block text-[11px] text-slate-400">{d.parentPhone}</span>}</td>
                        <td className={TABLE.td}>
                          <div className="flex flex-wrap gap-1">
                            {d.fees.map((f) => (
                              <Badge key={f.id} tone={f.overdue ? 'danger' : 'warning'}>{f.feeCategory} · {formatMinor(f.balanceMinor)}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className={`${TABLE.tdRight} ${d.overdueMinor > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{d.overdueMinor > 0 ? formatMinor(d.overdueMinor) : '—'}</td>
                        <td className={`${TABLE.tdRight} font-bold text-amber-600`}>{formatMinor(d.totalMinor)}</td>
                        <td className={TABLE.tdRight}>
                          <Button size="sm" variant="secondary" loading={pdfBusy === d.studentId} onClick={() => downloadDemand(d.studentId, d.admissionNo)} aria-label={`Download fee demand for ${d.name}`}>
                            <Download size={14} /> PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'log' && (
        <div className={`${RESULT_PANEL} mt-4`}>
          <p className="mb-3 text-sm text-slate-500">Every reminder attempt — sent, failed or skipped — with the reason. A fee is reminded at most once a day. SMS and WhatsApp aren’t connected yet.</p>
          {log && log.data.length === 0 && <EmptyState icon={<BellRing size={22} />} title="No reminders sent yet" description="Reminders you send appear here." />}
          {log && log.data.length > 0 && (
            <>
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[44rem]`}>
                  <thead className={TABLE.head}>
                    <tr>
                      <th className={TABLE.th}>When</th>
                      <th className={TABLE.th}>Student</th>
                      <th className={TABLE.th}>Fee</th>
                      <th className={TABLE.th}>Reminder</th>
                      <th className={TABLE.th}>Channel</th>
                      <th className={TABLE.th}>Result</th>
                    </tr>
                  </thead>
                  <tbody className={TABLE.body}>
                    {log.data.map((r) => (
                      <tr key={r.id} className={TABLE.row}>
                        <td className={`${TABLE.td} whitespace-nowrap text-slate-600`}>{formatDateTime(r.createdAt)}</td>
                        <td className={TABLE.td}>{r.studentName}<span className="block font-mono text-[11px] text-slate-400">{r.admissionNo}</span></td>
                        <td className={TABLE.td}>{r.feeCategory}</td>
                        <td className={TABLE.td}>{r.kind.charAt(0) + r.kind.slice(1).toLowerCase()}</td>
                        <td className={TABLE.td}>{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                        <td className={TABLE.td}><Badge tone={STATUS_TONES[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>{r.detail && <span className="block text-[11px] text-slate-400">{r.detail}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination page={log.page} totalPages={Math.max(1, Math.ceil(log.total / log.pageSize))} total={log.total} pageSize={log.pageSize} noun="entries" onPageChange={setLogPage} />
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!sending}
        title={sending ? `Send ${KIND_LABELS[sending].toLowerCase()}s?` : ''}
        description={`Parents of ${hasFilter ? 'the selected class or section' : 'every student who owes'} get an in-app notice, and an email where the school’s mail is set up. A fee already reminded in the last 24 hours is skipped.`}
        confirmLabel="Send reminders"
        loading={busy}
        onConfirm={send}
        onCancel={() => setSending(null)}
      />
    </div>
  );
}
