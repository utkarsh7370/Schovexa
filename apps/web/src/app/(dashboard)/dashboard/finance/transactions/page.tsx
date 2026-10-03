'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, EmptyState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, StatCard } from '@schovexa/ui';
import { BadgeIndianRupee, Banknote, FileSpreadsheet, Receipt, RotateCcw, SearchX, Pencil, Wallet } from 'lucide-react';
import { useTransactions, type TransactionRow } from '../../../../../hooks/useFinance';
import { useFinanceConfig } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { formatMinor } from '../../../../../lib/currency';
import { TABLE } from '../../../../../lib/table-styles';
import { CorrectPaymentDialog, RefundRequestDialog } from '../../../../../components/finance/finance-dialogs';
import { ClassSectionFilters, DateRangeFilters, FILTER_PANEL, RESULT_PANEL, StudentPhoto, formatDay } from '../../../../../components/finance/finance-ui';

export default function TransactionsPage() {
  const { can } = useCan();
  const { data: config } = useFinanceConfig();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [method, setMethod] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [cls, setCls] = useState({ classId: '', sectionId: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [correcting, setCorrecting] = useState<TransactionRow | null>(null);
  const [refunding, setRefunding] = useState<TransactionRow | null>(null);

  const filters = { search: debounced || undefined, method: method || undefined, from: range.from || undefined, to: range.to || undefined, classId: cls.classId || undefined, sectionId: cls.sectionId || undefined, page, pageSize };
  const { data, isLoading, isError } = useTransactions(filters);
  const filtersOn = !!(debounced || method || range.from || range.to || cls.classId);
  const reset = () => {
    setSearch('');
    setMethod('');
    setRange({ from: '', to: '' });
    setCls({ classId: '', sectionId: '' });
    setPage(1);
  };
  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Finance"
        title="Transactions"
        description="Every payment collected, with its receipt. Open a receipt to print it again."
        action={
          can('financeReport.view') && (
            <Link href="/dashboard/finance/reports?kind=transactions">
              <Button variant="secondary">
                <FileSpreadsheet size={16} /> Export
              </Button>
            </Link>
          )
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={filtersOn ? 'Collected (filtered)' : 'Total collected'} tone="emerald" icon={<BadgeIndianRupee size={18} />} value={data ? formatMinor(data.totalMinor) : <Skeleton className="h-8 w-24" />} />
        <StatCard label="Payments" tone="blue" icon={<Receipt size={18} />} value={data ? data.pagination.total : <Skeleton className="h-8 w-12" />} />
        <StatCard label="Payment methods" tone="violet" icon={<Banknote size={18} />} value={config ? config.paymentMethods.map((m) => m.label).join(', ') : <Skeleton className="h-8 w-16" />} hint={config?.onlinePaymentsEnabled ? undefined : 'Online payments are off'} />
      </div>

      <div className={`${FILTER_PANEL} mt-6`}>
        <SearchInput value={search} onChange={change(setSearch)} placeholder="Search by student, admission number, receipt no. or voucher no.…" aria-label="Search transactions" />
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ClassSectionFilters classId={cls.classId} sectionId={cls.sectionId} onChange={change(setCls)} />
          <SelectField fieldSize="sm" aria-label="Payment method" leftIcon={<Wallet size={16} />} value={method} onChange={(e) => change(setMethod)(e.target.value)}>
            <option value="">All methods</option>
            {(config?.paymentMethods ?? [{ value: 'CASH', label: 'Cash' }]).map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </SelectField>
          <div />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangeFilters from={range.from} to={range.to} onChange={change(setRange)} />
          {filtersOn && (
            <div className="flex items-end">
              <Button variant="secondary" onClick={reset}>Clear filters</Button>
            </div>
          )}
        </div>
      </div>

      <div className={RESULT_PANEL}>
        {isError && <p className="text-sm text-red-600">We couldn’t load the transactions. Please try again.</p>}
        {isLoading && (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        )}
        {data && data.data.length === 0 && (
          <EmptyState icon={filtersOn ? <SearchX size={22} /> : <Receipt size={22} />} title={filtersOn ? 'No payments match' : 'No payments yet'} description={filtersOn ? 'Try clearing a filter.' : 'Payments you collect will be listed here.'} />
        )}
        {data && data.data.length > 0 && (
          <>
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[56rem]`}>
                <thead className={TABLE.head}>
                  <tr>
                    <th className={TABLE.th}>Receipt</th>
                    <th className={TABLE.th}>Date</th>
                    <th className={TABLE.th}>Student</th>
                    <th className={TABLE.th}>Fee</th>
                    <th className={TABLE.th}>Method</th>
                    <th className={TABLE.thRight}>Amount</th>
                    <th className={TABLE.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {data.data.map((p) => (
                    <tr key={p.id} className={TABLE.row}>
                      <td className={TABLE.td}>
                        {p.receiptId ? (
                          <Link href={`/dashboard/receipts/${p.receiptId}`} className="font-mono text-sm font-semibold text-brand-blue hover:underline">{p.receiptNo}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`${TABLE.td} whitespace-nowrap text-slate-600`}>{formatDay(p.paidAt)}</td>
                      <td className={TABLE.td}>
                        <Link href={`/dashboard/finance/students/${p.student.id}`} className="flex items-center gap-2.5">
                          <StudentPhoto name={p.student.name} photoUrl={null} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-navy hover:text-brand-blue">{p.student.name}</span>
                            <span className="block font-mono text-[11px] text-slate-400">{p.student.admissionNo}{p.student.className && ` · ${p.student.className}${p.student.sectionName ? `-${p.student.sectionName}` : ''}`}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={`${TABLE.td} text-slate-600`}>{p.feeCategory}</td>
                      <td className={TABLE.td}>
                        <span className="text-slate-700">{p.methodLabel}</span>
                        {p.reference && <span className="block text-[11px] text-slate-400">{p.reference}</span>}
                      </td>
                      <td className={`${TABLE.tdRight} font-bold text-emerald-600`}>
                        {formatMinor(p.amountMinor)}
                        <span className="mt-0.5 flex justify-end gap-1">
                          {p.corrected && <Badge tone="warning" title={p.correctionReason ?? undefined}>Corrected</Badge>}
                          {p.refundedMinor > 0 && <Badge tone="danger">Refunded {formatMinor(p.refundedMinor)}</Badge>}
                          {p.hasOpenRefund && <Badge tone="info">Refund pending</Badge>}
                        </span>
                      </td>
                      <td className={TABLE.tdRight}>
                        <div className="flex justify-end gap-1.5">
                          {can('payment.correct') && (
                            <Button size="sm" variant="secondary" onClick={() => setCorrecting(p)} aria-label={`Correct payment ${p.receiptNo ?? ''}`}>
                              <Pencil size={14} /> Correct
                            </Button>
                          )}
                          {can('refund.request') && p.refundableMinor > 0 && (
                            <Button size="sm" variant="secondary" onClick={() => setRefunding(p)} aria-label={`Request refund for ${p.receiptNo ?? 'payment'}`}>
                              <RotateCcw size={14} /> Refund
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="payments" pageSizeOptions={[10, 25, 50]} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            </div>
          </>
        )}
      </div>

      <CorrectPaymentDialog
        payment={correcting && { id: correcting.id, amountMinor: correcting.amountMinor, paidAt: correcting.paidAt, receivedFrom: correcting.receivedFrom, note: correcting.note, reference: correcting.reference, receiptNo: correcting.receiptNo, hasRefunds: correcting.refundedMinor > 0 || correcting.hasOpenRefund }}
        onClose={() => setCorrecting(null)}
      />
      <RefundRequestDialog
        payment={refunding && { id: refunding.id, receiptNo: refunding.receiptNo, studentName: refunding.student.name, amountMinor: refunding.amountMinor, refundableMinor: refunding.refundableMinor }}
        onClose={() => setRefunding(null)}
      />
    </div>
  );
}
