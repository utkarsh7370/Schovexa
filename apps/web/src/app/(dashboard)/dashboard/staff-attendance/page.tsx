'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Badge, Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Pagination, SearchInput, Skeleton, StatCard, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { CalendarOff, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Hourglass, LogIn, LogOut, SearchX, Timer, UserCheck, UserX, Users, XCircle } from 'lucide-react';
import {
  STAFF_ATTENDANCE_PENDING_KEY,
  STAFF_ATTENDANCE_ROSTER_KEY,
  useStaffRoster,
  type StaffRosterRow,
} from '../../../../hooks/useStaffAttendance';
import { NOTIFICATIONS_QUERY_KEY } from '../../../../hooks/useNotices';
import { useCan } from '../../../../hooks/useCan';
import { useClientPaging } from '../../../../hooks/useClientPaging';
import { api, ApiError } from '../../../../lib/api-client';
import { TABLE } from '../../../../lib/table-styles';
import { APPROVAL_BADGE, formatClock, formatHmLabel } from '../../../../components/punch-card';

type Filter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_MARKED';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'Everyone' },
  { id: 'PENDING', label: 'Awaiting approval' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'NOT_MARKED', label: 'Not marked' },
];

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function StaffAttendancePage() {
  const [date, setDate] = useState<string | undefined>(undefined);
  const { data, isLoading, isError } = useStaffRoster(date);
  const { can } = useCan();
  const canApprove = can('staffAttendance.approve');
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StaffRosterRow | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_ROSTER_KEY }),
      queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_PENDING_KEY }),
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
    ]);

  const shownDate = data?.date ?? date;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (filter === 'NOT_MARKED' && row.record) return false;
      if (filter !== 'ALL' && filter !== 'NOT_MARKED' && row.record?.approval !== filter) return false;
      if (q && !`${row.name} ${row.email} ${row.roleName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, query]);

  const paging = useClientPaging(filtered, `${filter}|${query}|${shownDate}`, [10, 25, 50]);

  const approve = async (row: StaffRosterRow) => {
    if (!row.record) return;
    setBusyId(row.record.id);
    try {
      await api.post(`/staff-attendance/${row.record.id}/approve`, {});
      await refresh();
      toast.show({ tone: 'success', title: `${row.name} approved` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not approve', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting?.record) return;
    if (reason.trim().length < 3) {
      setReasonError('Say why (at least 3 characters).');
      return;
    }
    setBusyId(rejecting.record.id);
    try {
      await api.post(`/staff-attendance/${rejecting.record.id}/reject`, { note: reason.trim() });
      await refresh();
      toast.show({ tone: 'success', title: `${rejecting.name}’s day was rejected`, description: 'They have been told why.' });
      setRejecting(null);
      setReason('');
    } catch (err) {
      setReasonError(err instanceof ApiError ? err.message : 'Could not reject.');
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    if (!shownDate) return;
    setSavingAll(true);
    setServerError(null);
    try {
      const res = await api.post<{ approved: number }>('/staff-attendance/approve-all', { date: shownDate });
      await refresh();
      setApprovingAll(false);
      toast.show({ tone: 'success', title: `${res.approved} ${res.approved === 1 ? 'day' : 'days'} approved` });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not approve.');
    } finally {
      setSavingAll(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Teaching"
        title="Staff Attendance"
        description="See who has punched in, who is late, and approve each day."
        action={
          canApprove && summary && summary.pendingApproval > 0 ? (
            <Button onClick={() => setApprovingAll(true)}>
              <CheckCheck size={16} /> Approve all ({summary.pendingApproval})
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <Button size="sm" variant="secondary" aria-label="Previous day" disabled={!shownDate} onClick={() => shownDate && setDate(shiftDay(shownDate, -1))}>
          <ChevronLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1 text-center sm:flex-none sm:text-left">
          <div className="font-bold text-navy">{shownDate ? longDate(shownDate) : <Skeleton className="h-5 w-48" />}</div>
          <p className="text-xs text-slate-500">
            {data ? (data.isToday ? 'Today' : 'Past day') : ''}
            {data && ` · School hours ${formatHmLabel(data.schedule.punchIn)} – ${formatHmLabel(data.schedule.punchOut)}`}
          </p>
        </div>
        <Button size="sm" variant="secondary" aria-label="Next day" disabled={!data || data.isToday} onClick={() => shownDate && setDate(shiftDay(shownDate, 1))}>
          <ChevronRight size={16} />
        </Button>
        <div className="w-full sm:ml-auto sm:w-44">
          <TextField label="Jump to date" type="date" max={data?.isToday ? shownDate : undefined} value={shownDate ?? ''} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>

      {data?.holiday && (
        <Alert variant="info" className="mt-4">
          <span className="inline-flex items-center gap-2"><CalendarOff size={16} /> {data.holiday.name} — school is closed, so nobody is expected to punch in.</span>
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Expected" tone="blue" icon={<Users size={18} />} value={summary ? summary.expected : <Skeleton className="h-8 w-10" />} />
        <StatCard label="Present" tone="emerald" icon={<UserCheck size={18} />} value={summary ? summary.present : <Skeleton className="h-8 w-10" />} />
        <StatCard label="Late" tone="amber" icon={<Timer size={18} />} value={summary ? summary.late : <Skeleton className="h-8 w-10" />} />
        <StatCard label="Not marked" tone="default" icon={<UserX size={18} />} value={summary ? summary.notMarked : <Skeleton className="h-8 w-10" />} />
        <StatCard label="To approve" tone="violet" icon={<Hourglass size={18} />} value={summary ? summary.pendingApproval : <Skeleton className="h-8 w-10" />} />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={[
                  'rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue',
                  filter === f.id ? 'bg-brand-gradient text-white shadow-glow ring-transparent' : 'bg-white text-slate-600 ring-slate-200 hover:text-brand-blue hover:ring-brand-blue/40',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <SearchInput className="sm:w-64" value={query} onChange={setQuery} placeholder="Search staff…" aria-label="Search staff" />
        </div>

        {isError && <Alert variant="error" className="mt-4">We couldn’t load staff attendance. Please refresh and try again.</Alert>}

        <div className="mt-5">
          {isLoading && <Skeleton className="h-48 rounded-xl" />}
          {data && filtered.length === 0 && (
            <EmptyState
              icon={<SearchX size={22} />}
              title={data.rows.length === 0 ? 'No staff expected to punch in' : 'No one matches'}
              description={data.rows.length === 0 ? 'Roles that can mark their own attendance (like Teacher) appear here.' : 'Try another filter or search.'}
            />
          )}
          {data && filtered.length > 0 && (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.head}>
                  <tr>
                    <th scope="col" className={TABLE.th}>Staff member</th>
                    <th scope="col" className={TABLE.th}>Punched in</th>
                    <th scope="col" className={TABLE.th}>Punched out</th>
                    <th scope="col" className={TABLE.th}>Status</th>
                    {canApprove && <th scope="col" className={TABLE.thRight}>Decision</th>}
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {paging.visible.map((row) => {
                    const r = row.record;
                    const approval = r ? APPROVAL_BADGE[r.approval] : null;
                    return (
                      <tr key={row.userId} className={TABLE.row}>
                        <td className={TABLE.td}>
                          <div className="flex items-center gap-3">
                            <Avatar name={row.name} tone="auto" size={36} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-navy">{row.name}</p>
                              <p className="truncate text-xs text-slate-500">{row.roleName}</p>
                            </div>
                          </div>
                        </td>
                        <td className={TABLE.td}>
                          {r ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-navy">
                              <LogIn size={14} className="text-slate-400" /> {formatClock(r.punchInAt)}
                              {r.lateMinutes > 0 && <Badge tone="warning">Late {r.lateMinutes}m</Badge>}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={TABLE.td}>
                          {r?.punchOutAt ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-navy">
                              <LogOut size={14} className="text-slate-400" /> {formatClock(r.punchOutAt)}
                              {r.earlyLeaveMinutes > 0 && <Badge tone="warning">{r.earlyLeaveMinutes}m early</Badge>}
                            </span>
                          ) : (
                            <span className="text-slate-400">{r ? 'Still in' : '—'}</span>
                          )}
                        </td>
                        <td className={TABLE.td}>
                          {approval ? (
                            <div>
                              <Badge tone={approval.tone} dot pulse={r?.approval === 'PENDING'}>{approval.label}</Badge>
                              {r?.decisionNote && r.decisionNote !== 'Auto-approved' && <p className="mt-1 max-w-[14rem] truncate text-xs text-slate-500" title={r.decisionNote}>“{r.decisionNote}”</p>}
                            </div>
                          ) : (
                            <Badge tone="neutral">{data.holiday ? 'Holiday' : 'Not marked'}</Badge>
                          )}
                        </td>
                        {canApprove && (
                          <td className={TABLE.tdRight}>
                            {r?.approval === 'PENDING' && (
                              <div className="inline-flex items-center gap-2">
                                <Button size="sm" loading={busyId === r.id} onClick={() => approve(row)}>
                                  <CheckCircle2 size={14} /> Approve
                                </Button>
                                <Button size="sm" variant="soft-danger" disabled={busyId === r.id} onClick={() => { setRejecting(row); setReason(''); setReasonError(null); }}>
                                  <XCircle size={14} /> Reject
                                </Button>
                              </div>
                            )}
                            {r && r.approval !== 'PENDING' && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock size={12} /> Decided</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data && filtered.length > 0 && (
            <div className="mt-4">
              <Pagination page={paging.page} totalPages={paging.totalPages} onPageChange={paging.setPage} pageSize={paging.pageSize} onPageSizeChange={paging.setPageSize} pageSizeOptions={paging.sizes} total={filtered.length} noun="staff" />
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        eyebrow={<span className="text-xs font-semibold uppercase tracking-wide text-red-600">Reject attendance</span>}
        title={rejecting ? `Reject ${rejecting.name}’s day?` : 'Reject'}
        description="They’ll be told your reason, and can’t change that day afterwards."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button type="button" variant="danger" loading={busyId === rejecting?.record?.id} onClick={reject}>Reject day</Button>
          </>
        }
      >
        <TextAreaField label="Reason" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null); }} placeholder="e.g. You were on approved leave." error={reasonError ?? undefined} />
      </Dialog>

      <ConfirmDialog
        open={approvingAll}
        title={`Approve all ${summary?.pendingApproval ?? ''} waiting ${summary?.pendingApproval === 1 ? 'day' : 'days'}?`}
        description={serverError ?? `Everyone who has punched in on ${shownDate ? longDate(shownDate) : 'this day'} and is waiting for a decision will be approved.`}
        confirmLabel="Approve all"
        loading={savingAll}
        onConfirm={approveAll}
        onCancel={() => setApprovingAll(false)}
      />
    </div>
  );
}
