'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Badge, Button, EmptyState, Skeleton, StatCard, Tabs } from '@schovexa/ui';
import { ArrowLeft, Banknote, BookText, Gift, History, Mail, Pencil, Phone, Receipt, RotateCcw, Tag, Wallet } from 'lucide-react';
import { useFinanceStudent, useLedger, useTransactions, type FinanceFeeRow, type TransactionRow } from '../../../../../../hooks/useFinance';
import { useCan } from '../../../../../../hooks/useCan';
import { formatMinor } from '../../../../../../lib/currency';
import { TABLE } from '../../../../../../lib/table-styles';
import { ConcessionDialog, CorrectPaymentDialog, RefundRequestDialog } from '../../../../../../components/finance/finance-dialogs';
import { FEE_STATUS_LABELS, FEE_STATUS_TONES, StudentPhoto, formatDay } from '../../../../../../components/finance/finance-ui';

type Tab = 'fees' | 'payments' | 'ledger';

export default function StudentFinancePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useCan();
  const { data: student, isLoading, isError } = useFinanceStudent(id);
  const [tab, setTab] = useState<Tab>('fees');
  const [discountFee, setDiscountFee] = useState<FinanceFeeRow | null>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert variant="error">We couldn’t find that student.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/finance/collect" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-blue">
        <ArrowLeft size={14} /> Collect fee
      </Link>

      <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card">
        <div className="h-20 bg-brand-gradient-dark" aria-hidden="true" />
        <div className="-mt-10 flex flex-wrap items-end gap-5 px-6 pb-6">
          {isLoading || !student ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="rounded-full ring-4 ring-white">
                <StudentPhoto name={student.name} photoUrl={student.photoUrl} size={84} />
              </div>
              <div className="min-w-0 flex-1 pt-10">
                <h1 className="truncate text-2xl font-extrabold tracking-tight text-navy">{student.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span className="font-mono">{student.admissionNo}</span>
                  <span>{student.className ? `${student.className}${student.sectionName ? ` – ${student.sectionName}` : ''}` : 'No class'}</span>
                  <Badge tone={student.status === 'ENROLLED' ? 'success' : 'neutral'}>{student.status.charAt(0) + student.status.slice(1).toLowerCase()}</Badge>
                </p>
              </div>
              {can('fee.collect') && student.summary.balanceMinor > 0 && (
                <Link href={`/dashboard/finance/collect?student=${student.id}`}>
                  <Button>
                    <Banknote size={16} /> Collect fee
                  </Button>
                </Link>
              )}
            </>
          )}
        </div>
        {student && student.parents.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Parents / guardians</p>
            <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              {student.parents.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="font-semibold text-navy">{p.name}</span> <span className="text-slate-500">({p.relation}{p.isPrimary ? ', primary' : ''})</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-4 text-slate-600">
                    {p.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={13} className="text-slate-400" /> {p.phone}
                      </span>
                    )}
                    {p.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail size={13} className="text-slate-400" /> {p.email}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Billed (after discounts)" tone="blue" icon={<Wallet size={18} />} value={student ? formatMinor(student.summary.netDueMinor) : <Skeleton className="h-8 w-20" />} hint={student && student.summary.discountMinor > 0 ? `${formatMinor(student.summary.discountMinor)} discounts` : undefined} />
        <StatCard label="Paid" tone="emerald" icon={<Banknote size={18} />} value={student ? formatMinor(student.summary.paidMinor) : <Skeleton className="h-8 w-20" />} />
        <StatCard label="Outstanding" tone="amber" icon={<Tag size={18} />} value={student ? formatMinor(student.summary.balanceMinor) : <Skeleton className="h-8 w-20" />} />
        <StatCard label="Overdue" tone="violet" icon={<History size={18} />} value={student ? formatMinor(student.summary.overdueMinor) : <Skeleton className="h-8 w-20" />} />
      </div>

      <Tabs
        className="mt-6 w-fit max-w-full"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={[
          { id: 'fees', label: 'Fees', icon: <Wallet size={16} />, count: student?.fees.length },
          { id: 'payments', label: 'Payment history', icon: <Receipt size={16} /> },
          { id: 'ledger', label: 'Ledger', icon: <BookText size={16} /> },
        ]}
      />

      <div key={tab} className="mt-6 animate-fade-in-up">
        {tab === 'fees' && <FeesTab studentId={id} fees={student?.fees} loading={isLoading} onDiscount={setDiscountFee} />}
        {tab === 'payments' && <PaymentsTab studentId={id} />}
        {tab === 'ledger' && <LedgerTab studentId={id} />}
      </div>

      <ConcessionDialog fee={discountFee && student ? { id: discountFee.id, studentName: student.name, feeCategory: discountFee.feeCategory, amountDueMinor: discountFee.amountDueMinor, balanceMinor: discountFee.balanceMinor } : null} onClose={() => setDiscountFee(null)} />
    </div>
  );
}

function FeesTab({ studentId, fees, loading, onDiscount }: { studentId: string; fees: FinanceFeeRow[] | undefined; loading: boolean; onDiscount: (fee: FinanceFeeRow) => void }) {
  const { can } = useCan();
  if (loading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!fees || fees.length === 0) return <EmptyState icon={<Wallet size={22} />} title="No fees assigned" description="Fees are assigned from the Fees page." />;
  return (
    <div className="flex flex-col gap-3">
      {fees.map((fee) => {
        const open = fee.status !== 'WAIVED' && fee.status !== 'PAID' && fee.balanceMinor > 0;
        const pct = fee.netDueMinor > 0 ? Math.min(100, Math.round((fee.paidMinor / fee.netDueMinor) * 100)) : 100;
        return (
          <div key={fee.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-base font-bold text-navy">
                  {fee.feeCategory}
                  <Badge tone={FEE_STATUS_TONES[fee.status]}>{FEE_STATUS_LABELS[fee.status]}</Badge>
                  {fee.overdue && <Badge tone="danger">Overdue</Badge>}
                </p>
                <p className="mt-1 text-sm text-slate-500">Due {formatDay(fee.dueDate)}{fee.lateFeeMinor > 0 && <span className="font-semibold text-rose-600"> · late fee {formatMinor(fee.lateFeeMinor)} ({fee.daysLate} days, shown not added)</span>}</p>
              </div>
              {open && (
                <div className="flex gap-2">
                  {can('fee.collect') && (
                    <Link href={`/dashboard/finance/collect?student=${studentId}&fee=${fee.id}`}>
                      <Button size="sm">
                        <Banknote size={14} /> Collect
                      </Button>
                    </Link>
                  )}
                  {can('discount.request') && (
                    <Button size="sm" variant="secondary" onClick={() => onDiscount(fee)}>
                      <Gift size={14} /> Discount
                    </Button>
                  )}
                </div>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ['Fee', formatMinor(fee.amountDueMinor), ''],
                ['Discounts', fee.discountMinor > 0 ? `− ${formatMinor(fee.discountMinor)}` : '—', ''],
                ['Paid', formatMinor(fee.paidMinor), 'text-emerald-600'],
                ['Refunded', fee.refundedMinor > 0 ? formatMinor(fee.refundedMinor) : '—', ''],
                ['Balance', formatMinor(fee.balanceMinor), fee.balanceMinor > 0 ? 'text-amber-600' : ''],
              ].map(([k, v, tone]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className={`mt-0.5 font-bold text-navy ${tone}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentsTab({ studentId }: { studentId: string }) {
  const { can } = useCan();
  const { data, isLoading } = useTransactions({ studentId, pageSize: 100 });
  const [correcting, setCorrecting] = useState<TransactionRow | null>(null);
  const [refunding, setRefunding] = useState<TransactionRow | null>(null);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data || data.data.length === 0) return <EmptyState icon={<Receipt size={22} />} title="No payments yet" description="Payments for this student will be listed here." />;
  return (
    <>
      <div className={TABLE.wrap}>
        <table className={`${TABLE.table} min-w-[44rem]`}>
          <thead className={TABLE.head}>
            <tr>
              <th className={TABLE.th}>Receipt</th>
              <th className={TABLE.th}>Date</th>
              <th className={TABLE.th}>Fee</th>
              <th className={TABLE.th}>Method</th>
              <th className={TABLE.th}>Collected by</th>
              <th className={TABLE.thRight}>Amount</th>
              <th className={TABLE.thRight}>Actions</th>
            </tr>
          </thead>
          <tbody className={TABLE.body}>
            {data.data.map((p) => (
              <tr key={p.id} className={TABLE.row}>
                <td className={TABLE.td}>{p.receiptId ? <Link href={`/dashboard/receipts/${p.receiptId}`} className="font-mono font-semibold text-brand-blue hover:underline">{p.receiptNo}</Link> : '—'}</td>
                <td className={`${TABLE.td} whitespace-nowrap`}>{formatDay(p.paidAt)}</td>
                <td className={TABLE.td}>{p.feeCategory}</td>
                <td className={TABLE.td}>{p.methodLabel}{p.reference && <span className="block text-[11px] text-slate-400">{p.reference}</span>}</td>
                <td className={`${TABLE.td} text-slate-600`}>{p.collectedBy ?? '—'}</td>
                <td className={`${TABLE.tdRight} font-bold text-emerald-600`}>
                  {formatMinor(p.amountMinor)}
                  <span className="mt-0.5 flex justify-end gap-1">
                    {p.corrected && <Badge tone="warning">Corrected</Badge>}
                    {p.refundedMinor > 0 && <Badge tone="danger">Refunded {formatMinor(p.refundedMinor)}</Badge>}
                    {p.hasOpenRefund && <Badge tone="info">Refund pending</Badge>}
                  </span>
                </td>
                <td className={TABLE.tdRight}>
                  <div className="flex justify-end gap-1.5">
                    {can('payment.correct') && (
                      <Button size="sm" variant="secondary" onClick={() => setCorrecting(p)}>
                        <Pencil size={14} /> Correct
                      </Button>
                    )}
                    {can('refund.request') && p.refundableMinor > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => setRefunding(p)}>
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
      <CorrectPaymentDialog
        payment={correcting && { id: correcting.id, amountMinor: correcting.amountMinor, paidAt: correcting.paidAt, receivedFrom: correcting.receivedFrom, note: correcting.note, reference: correcting.reference, receiptNo: correcting.receiptNo, hasRefunds: correcting.refundedMinor > 0 || correcting.hasOpenRefund }}
        onClose={() => setCorrecting(null)}
      />
      <RefundRequestDialog payment={refunding && { id: refunding.id, receiptNo: refunding.receiptNo, studentName: refunding.student.name, amountMinor: refunding.amountMinor, refundableMinor: refunding.refundableMinor }} onClose={() => setRefunding(null)} />
    </>
  );
}

const LEDGER_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = { CHARGE: 'warning', DISCOUNT: 'info', WAIVER: 'neutral', PAYMENT: 'success', REFUND: 'danger' };
const LEDGER_LABELS: Record<string, string> = { CHARGE: 'Billed', DISCOUNT: 'Discount', WAIVER: 'Waived', PAYMENT: 'Payment', REFUND: 'Refund' };

function LedgerTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useLedger(studentId);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data || data.entries.length === 0) return <EmptyState icon={<BookText size={22} />} title="Nothing in the ledger" description="Fees billed, discounts, payments and refunds appear here in date order." />;
  return (
    <>
      <div className={TABLE.wrap}>
        <table className={`${TABLE.table} min-w-[44rem]`}>
          <thead className={TABLE.head}>
            <tr>
              <th className={TABLE.th}>Date</th>
              <th className={TABLE.th}>Type</th>
              <th className={TABLE.th}>Details</th>
              <th className={TABLE.thRight}>Charged</th>
              <th className={TABLE.thRight}>Credited</th>
              <th className={TABLE.thRight}>Balance</th>
            </tr>
          </thead>
          <tbody className={TABLE.body}>
            {data.entries.map((e, i) => (
              <tr key={i} className={TABLE.row}>
                <td className={`${TABLE.td} whitespace-nowrap text-slate-600`}>{formatDay(e.at)}</td>
                <td className={TABLE.td}><Badge tone={LEDGER_TONES[e.type]}>{LEDGER_LABELS[e.type]}</Badge></td>
                <td className={TABLE.td}>{e.description}{e.reference && <span className="ml-2 font-mono text-[11px] text-slate-400">{e.reference}</span>}</td>
                <td className={TABLE.tdRight}>{e.debitMinor ? formatMinor(e.debitMinor) : '—'}</td>
                <td className={`${TABLE.tdRight} text-emerald-600`}>{e.creditMinor ? formatMinor(e.creditMinor) : '—'}</td>
                <td className={`${TABLE.tdRight} font-bold text-navy`}>{formatMinor(e.balanceMinor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50/80 text-sm font-bold text-navy">
              <td className={TABLE.td} colSpan={3}>Totals</td>
              <td className={TABLE.tdRight}>{formatMinor(data.totals.billedMinor + data.totals.refundedMinor)}</td>
              <td className={`${TABLE.tdRight} text-emerald-600`}>{formatMinor(data.totals.paidMinor + data.totals.discountsMinor)}</td>
              <td className={TABLE.tdRight}>{formatMinor(data.totals.balanceMinor)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
