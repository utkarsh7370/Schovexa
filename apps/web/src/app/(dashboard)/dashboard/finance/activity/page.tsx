'use client';

import { useState } from 'react';
import { Alert, Badge, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton } from '@schovexa/ui';
import { ScrollText } from 'lucide-react';
import { useFinanceAudit } from '../../../../../hooks/useFinance';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { TABLE } from '../../../../../lib/table-styles';
import { DateRangeFilters, FILTER_PANEL, RESULT_PANEL, formatDateTime } from '../../../../../components/finance/finance-ui';

const ACTION_LABELS: Record<string, string> = {
  'payment.recorded': 'Payment recorded',
  'payment.corrected': 'Payment corrected',
  'receipt.reprinted': 'Receipt reprinted',
  'receipt.downloaded': 'Receipt downloaded',
  'receipt.sent': 'Receipt sent to parent',
  'refund.requested': 'Refund requested',
  'refund.approved': 'Refund approved',
  'refund.rejected': 'Refund rejected',
  'refund.withdrawn': 'Refund withdrawn',
  'refund.processed': 'Refund paid out',
  'concession.requested': 'Discount requested',
  'concession.approved': 'Discount approved',
  'concession.rejected': 'Discount rejected',
  'concession.applied': 'Discount applied',
  'finance.export': 'Report exported',
  'finance.reminders.sent': 'Reminders sent',
};

const MODULE_LABELS: Record<string, string> = { payment: 'Payments', refund: 'Refunds', discount: 'Discounts', fee: 'Fees', receipt: 'Receipts', finance: 'Reports & reminders' };

function describe(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const parts: string[] = [];
  const money = (v: unknown) => `₹${(Number(v) / 100).toFixed(2)}`;
  if (typeof metadata.amountMinor === 'number') parts.push(money(metadata.amountMinor));
  if (typeof metadata.receiptNo === 'string') parts.push(`receipt ${metadata.receiptNo}`);
  if (typeof metadata.name === 'string') parts.push(metadata.name);
  if (typeof metadata.report === 'string') parts.push(`${metadata.report} (${String(metadata.format).toUpperCase()}, ${String(metadata.rows)} rows)`);
  if (typeof metadata.reason === 'string') parts.push(`reason: ${metadata.reason}`);
  if (typeof metadata.note === 'string' && metadata.note) parts.push(`note: ${metadata.note}`);
  const before = metadata.before as Record<string, unknown> | undefined;
  const after = metadata.after as Record<string, unknown> | undefined;
  if (before && after) {
    const changes = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    parts.push(`changed ${changes.map((k) => `${k.replace('Minor', '')}: ${k.endsWith('Minor') ? money(before[k]) : String(before[k] ?? '—')} → ${k.endsWith('Minor') ? money(after[k]) : String(after[k] ?? '—')}`).join('; ')}`);
  }
  if (typeof metadata.fees === 'number') parts.push(`${metadata.fees} fees, ${String(metadata.parentsReached)} parents reached`);
  return parts.join(' · ');
}

export default function FinanceActivityPage() {
  const [module, setModule] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useFinanceAudit({ module: module || undefined, q: debounced || undefined, from: range.from || undefined, to: range.to || undefined, page });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Finance" title="Finance activity log" description="Who recorded, corrected, refunded, discounted, printed or exported what — and when. Read-only." />

      <div className={`${FILTER_PANEL} mt-6`}>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by action, person or record…" aria-label="Search the activity log" />
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          <SelectField fieldSize="sm" aria-label="Area" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
            <option value="">All areas</option>
            {(data?.modules ?? Object.keys(MODULE_LABELS)).map((m) => (
              <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
            ))}
          </SelectField>
          <DateRangeFilters from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
        </div>
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t load the activity log.</Alert>}
        {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
        {data && data.data.length === 0 && <EmptyState icon={<ScrollText size={22} />} title="No activity" description="Nothing matches these filters." />}
        {data && data.data.length > 0 && (
          <>
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[48rem]`}>
                <thead className={TABLE.head}>
                  <tr>
                    <th className={TABLE.th}>When</th>
                    <th className={TABLE.th}>Who</th>
                    <th className={TABLE.th}>What</th>
                    <th className={TABLE.th}>Details</th>
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {data.data.map((r) => (
                    <tr key={r.id} className={TABLE.row}>
                      <td className={`${TABLE.td} whitespace-nowrap text-slate-600`}>{formatDateTime(r.createdAt)}</td>
                      <td className={TABLE.td}>{r.actor?.name ?? 'System'}{r.device && <span className="block text-[11px] text-slate-400">{r.device}</span>}</td>
                      <td className={TABLE.td}><Badge tone="brand">{ACTION_LABELS[r.action] ?? r.action}</Badge></td>
                      <td className={`${TABLE.td} text-slate-600`}>{describe(r.metadata) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="entries" onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
