'use client';

import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Skeleton, StatCard } from '@schovexa/ui';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Banknote,
  CalendarClock,
  Clock3,
  FileSpreadsheet,
  Gift,
  Receipt,
  RotateCcw,
  Search,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useFinanceDashboard, type FinanceDashboard as Dashboard } from '../../hooks/useFinance';
import { useCan } from '../../hooks/useCan';
import { formatMinor } from '../../lib/currency';
import { CountUp } from '../count-up';
import { formatDateTime } from './finance-ui';

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tile: string;
  permission: string;
}

const ACTIONS: QuickAction[] = [
  { href: '/dashboard/finance/collect', label: 'Collect fee', description: 'Take a cash payment and print the receipt', icon: Banknote, tile: 'from-emerald-400 to-emerald-600', permission: 'fee.collect' },
  { href: '/dashboard/finance/collect?focus=search', label: 'Search student', description: 'Find a student’s fees and history', icon: Search, tile: 'from-brand-electric to-brand-blue', permission: 'finance.student' },
  { href: '/dashboard/finance/transactions', label: 'View transactions', description: 'Every payment, with receipts', icon: Receipt, tile: 'from-amber-400 to-orange-500', permission: 'fee.view' },
  { href: '/dashboard/finance/reports', label: 'Generate report', description: 'Collection, dues, refunds — export to Excel or PDF', icon: FileSpreadsheet, tile: 'from-violet-500 to-fuchsia-600', permission: 'financeReport.view' },
];

/** Daily collections for the last two weeks, as plain SVG bars — no chart library needed. */
function TrendChart({ trend }: { trend: Dashboard['trend'] }) {
  const max = Math.max(...trend.map((t) => t.amountMinor), 1);
  const total = trend.reduce((n, t) => n + t.amountMinor, 0);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 140 }} role="img" aria-label={`Collection over the last 14 days: ${formatMinor(total)} in total`}>
        {trend.map((t) => {
          const height = Math.max(t.amountMinor > 0 ? 6 : 2, Math.round((t.amountMinor / max) * 130));
          const day = new Date(`${t.date}T00:00:00`);
          return (
            <div key={t.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${formatMinor(t.amountMinor)}`}>
              <div
                className={['w-full rounded-t-md transition-all duration-500', t.amountMinor > 0 ? 'bg-gradient-to-t from-brand-blue to-brand-electric group-hover:from-brand-violet group-hover:to-brand-blue' : 'bg-slate-200'].join(' ')}
                style={{ height }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px] font-medium text-slate-400">
        {trend.map((t, i) => (
          <span key={t.date} className="flex-1 text-center">
            {i % 2 === 0 || i === trend.length - 1 ? new Date(`${t.date}T00:00:00`).getDate() : ''}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">
        <span className="font-bold text-navy">{formatMinor(total)}</span> collected over the last 14 days
      </p>
    </div>
  );
}

export function FinanceDashboard() {
  const { can } = useCan();
  const { data, isLoading, isError } = useFinanceDashboard();

  if (isError) return <Alert variant="error">We couldn’t load the finance dashboard. Please try again.</Alert>;

  const skeleton = <Skeleton className="h-8 w-24" />;
  const attention: { key: string; text: string; href: string }[] = [];
  if (data) {
    if (data.refunds.approvedToPayOut > 0) attention.push({ key: 'payout', text: `${data.refunds.approvedToPayOut} approved refund${data.refunds.approvedToPayOut === 1 ? '' : 's'} (${formatMinor(data.refunds.approvedMinor)}) waiting to be paid out`, href: '/dashboard/finance/refunds?status=APPROVED' });
    if (data.refunds.requested > 0) attention.push({ key: 'refunds', text: `${data.refunds.requested} refund request${data.refunds.requested === 1 ? '' : 's'} (${formatMinor(data.refunds.requestedMinor)}) waiting for approval`, href: '/dashboard/finance/refunds?status=REQUESTED' });
    if (data.pendingConcessions > 0) attention.push({ key: 'concessions', text: `${data.pendingConcessions} discount or scholarship request${data.pendingConcessions === 1 ? '' : 's'} not applied yet`, href: '/dashboard/finance/concessions' });
    if (data.overdue.fees > 0) attention.push({ key: 'overdue', text: `${data.overdue.fees} overdue fee${data.overdue.fees === 1 ? '' : 's'} — ${formatMinor(data.overdue.totalMinor)} past the due date`, href: '/dashboard/finance/demand' });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected today"
          tone="brand"
          icon={<Banknote size={20} />}
          value={data ? <CountUp value={data.collection.todayMinor} format={(n) => formatMinor(Math.round(n))} /> : <Skeleton className="h-8 w-28 bg-white/30" />}
          hint={data ? `${data.collection.todayCount} payment${data.collection.todayCount === 1 ? '' : 's'} today` : undefined}
        />
        <StatCard
          label="Total collected"
          tone="emerald"
          icon={<TrendingUp size={20} />}
          value={data ? formatMinor(data.collection.totalMinor) : skeleton}
          hint={data ? `${formatMinor(data.collection.monthMinor)} this month` : undefined}
        />
        <StatCard
          label="Outstanding"
          tone="amber"
          icon={<BadgeIndianRupee size={20} />}
          value={data ? formatMinor(data.outstanding.totalMinor) : skeleton}
          hint={data ? `${data.outstanding.fees} fee${data.outstanding.fees === 1 ? '' : 's'} unpaid` : undefined}
        />
        <StatCard
          label="Overdue"
          tone="violet"
          icon={<CalendarClock size={20} />}
          value={data ? formatMinor(data.overdue.totalMinor) : skeleton}
          hint={data ? `${data.overdue.fees} past the due date` : undefined}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending payments"
          tone="default"
          icon={<Clock3 size={20} />}
          value={data ? data.pendingPayments.pending + data.pendingPayments.partiallyPaid : <Skeleton className="h-8 w-12" />}
          hint={data ? `${data.pendingPayments.pending} not started · ${data.pendingPayments.partiallyPaid} part-paid` : undefined}
        />
        <StatCard
          label="Refund requests"
          tone="default"
          icon={<RotateCcw size={20} />}
          value={data ? data.refunds.requested + data.refunds.approvedToPayOut : <Skeleton className="h-8 w-12" />}
          hint={data ? `${data.refunds.requested} to approve · ${data.refunds.approvedToPayOut} to pay out` : undefined}
        />
        <StatCard
          label="Payment failures"
          tone="default"
          icon={<AlertTriangle size={20} />}
          value={data ? '—' : <Skeleton className="h-8 w-12" />}
          hint={data ? 'Online payments are off' : undefined}
        />
      </div>

      {attention.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-amber-950">
            <AlertTriangle size={18} /> Needs your attention <Badge tone="warning">{attention.length}</Badge>
          </h2>
          <ul className="mt-3 divide-y divide-amber-200/70">
            {attention.map((item) => (
              <li key={item.key} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-amber-900">{item.text}</span>
                <Link href={item.href} className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
                  Open <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-navy">Quick actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.filter((a) => can(a.permission)).map((a) => (
            <Link key={a.label} href={a.href}>
              <Card interactive className="group flex h-full items-center gap-4 p-5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${a.tile}`}>
                  <a.icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-navy">{a.label}</span>
                  <span className="block text-sm text-slate-500">{a.description}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-navy">
            <BarChart3 size={18} className="text-brand-blue" /> Collection trend
          </h2>
          <div className="mt-4">{data ? <TrendChart trend={data.trend} /> : <Skeleton className="h-40 w-full" />}</div>
          {data && data.collection.todayByMethod.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {data.collection.todayByMethod.map((m) => (
                <Badge key={m.method} tone="brand">
                  Today · {m.label}: {formatMinor(m.amountMinor)} ({m.count})
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <Wallet size={18} className="text-brand-blue" /> Recent transactions
            </h2>
            <Link href="/dashboard/finance/transactions" className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
              All <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-4">
            {isLoading && (
              <div className="flex flex-col gap-2" role="status" aria-label="Loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            )}
            {data && data.recentTransactions.length === 0 && <EmptyState icon={<Gift size={22} />} title="No payments yet" description="Payments you collect will show up here." />}
            <ul className="divide-y divide-slate-100">
              {data?.recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/dashboard/finance/students/${t.studentId}`} className="block truncate text-sm font-semibold text-navy hover:text-brand-blue">
                      {t.studentName}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {t.feeCategory} · {formatDateTime(t.paidAt)}
                      {t.receiptId && (
                        <>
                          {' · '}
                          <Link href={`/dashboard/receipts/${t.receiptId}`} className="font-mono text-brand-blue hover:underline">
                            {t.receiptNo}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-emerald-600">{formatMinor(t.amountMinor)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {data && !data.paymentFailures.enabled && <p className="mt-6 text-xs text-slate-400">{data.paymentFailures.message}</p>}
    </div>
  );
}
