'use client';

import { useState } from 'react';
import { Alert, Badge, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, TextField } from '@schovexa/ui';
import { CalendarDays, ScrollText, ShieldAlert } from 'lucide-react';
import { useAuditLog, type AuditEntry } from '../../../../hooks/useAuditLog';
import { useCan } from '../../../../hooks/useCan';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { ApiError } from '../../../../lib/api-client';
import { TABLE } from '../../../../lib/table-styles';
import { ForbiddenState } from '../../../../components/error-state';

const PAGE_SIZES = [25, 50, 100];

const MODULE_LABELS: Record<string, string> = {
  auth: 'Sign-in & accounts',
  user: 'People & access',
  role: 'Roles',
  security: 'Security',
  school: 'School settings',
  student: 'Students',
  parent: 'Parents',
  teacher: 'Teachers',
  attendance: 'Attendance',
  fee: 'Fees',
  notice: 'Notices',
};
const moduleLabel = (m: string) => MODULE_LABELS[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

// Reads "user.invite_created" as "User · Invite created".
function actionLabel(action: string): string {
  const [area, ...rest] = action.split('.');
  const what = rest.join(' ').replace(/_/g, ' ');
  return what ? `${what.charAt(0).toUpperCase()}${what.slice(1)}` : area;
}

function tone(entry: AuditEntry): 'danger' | 'warning' | 'info' | 'neutral' {
  if (entry.action === 'access.denied' || entry.action.endsWith('_failed')) return 'danger';
  if (/disable|revoked|password|role/.test(entry.action)) return 'warning';
  if (entry.action === 'api.write') return 'neutral';
  return 'info';
}

function describe(entry: AuditEntry): string {
  const m = entry.metadata ?? {};
  if (entry.action === 'api.write') return `${m.method ?? ''} ${m.route ?? ''} → ${m.status ?? ''}`.trim();
  const parts: string[] = [];
  if (typeof m.email === 'string') parts.push(m.email);
  if (typeof m.role === 'string') parts.push(`as ${m.role}`);
  if (typeof m.fromRole === 'string') parts.push(`was ${m.fromRole}`);
  if (typeof m.reason === 'string') parts.push(m.reason);
  if (entry.action === 'access.denied' && entry.resourceId) parts.push(entry.resourceId);
  return parts.join(' · ') || (entry.resourceType ?? '');
}

export default function AuditLogPage() {
  const { can, isLoading: permsLoading } = useCan();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useDebouncedValue(search.trim(), 300);

  const { data, isLoading, isError, error, isFetching } = useAuditLog({ page, pageSize, q, module, from, to });

  if (!permsLoading && !can('audit.view')) {
    return <ForbiddenState detail="The audit log is available to the school’s Director." />;
  }

  const reset = () => setPage(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Audit log"
        description="Who did what, and when — sign-ins, access changes and every change made to your school’s data. Entries can’t be edited or deleted."
      />

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
        <SearchInput
          value={search}
          busy={isFetching}
          onChange={(v) => {
            setSearch(v);
            reset();
          }}
          placeholder="Search by person, action or record…"
          aria-label="Search the audit log"
        />
        <SelectField
          aria-label="Area"
          fieldSize="sm"
          value={module}
          onChange={(e) => {
            setModule(e.target.value);
            reset();
          }}
        >
          <option value="">All areas</option>
          {data?.modules.map((m) => (
            <option key={m} value={m}>{moduleLabel(m)}</option>
          ))}
        </SelectField>
        <TextField label="From" type="date" value={from} leftIcon={<CalendarDays size={15} />} onChange={(e) => { setFrom(e.target.value); reset(); }} />
        <TextField label="To" type="date" value={to} leftIcon={<CalendarDays size={15} />} onChange={(e) => { setTo(e.target.value); reset(); }} />
      </div>

      {isError && <Alert variant="error">{error instanceof ApiError ? error.message : 'We couldn’t load the audit log.'}</Alert>}
      {isLoading && <Skeleton className="h-96 w-full rounded-2xl" />}

      {data && data.data.length === 0 && (
        <EmptyState icon={<ScrollText size={22} />} title="No entries match" description="Try a different search, area or date range." />
      )}

      {data && data.data.length > 0 && (
        <>
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[52rem]`}>
              <thead className={TABLE.head}>
                <tr>
                  <th className={TABLE.th}>When</th>
                  <th className={TABLE.th}>Who</th>
                  <th className={TABLE.th}>What</th>
                  <th className={TABLE.th}>Details</th>
                  <th className={TABLE.th}>Device</th>
                </tr>
              </thead>
              <tbody className={TABLE.body}>
                {data.data.map((e) => (
                  <tr key={e.id} className={TABLE.row}>
                    <td className={`${TABLE.td} whitespace-nowrap text-slate-600`}>
                      <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                    </td>
                    <td className={TABLE.td}>
                      {e.actor ? (
                        <>
                          <p className="font-semibold text-navy">{e.actor.name}</p>
                          <p className="text-xs text-slate-500">{e.actor.email}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">System</span>
                      )}
                    </td>
                    <td className={TABLE.td}>
                      <Badge tone={tone(e)}>
                        {e.action === 'access.denied' && <ShieldAlert size={12} />}
                        {e.action === 'api.write' ? 'Change' : actionLabel(e.action)}
                      </Badge>
                      <p className="mt-1 text-xs text-slate-400">{moduleLabel(e.module)}</p>
                    </td>
                    <td className={`${TABLE.td} max-w-xs break-words text-slate-600`}>{describe(e)}</td>
                    <td className={`${TABLE.td} text-xs text-slate-500`}>
                      {e.device ?? '—'}
                      {e.ipAddress && <p className="text-slate-400">{e.ipAddress}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            pageSize={data.pagination.pageSize}
            pageSizeOptions={PAGE_SIZES}
            noun="entries"
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              reset();
            }}
          />
        </>
      )}
    </div>
  );
}
