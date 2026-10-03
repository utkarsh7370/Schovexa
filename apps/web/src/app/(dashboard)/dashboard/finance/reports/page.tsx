'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, EmptyState, PageHeader, SelectField, Skeleton, useToast } from '@schovexa/ui';
import { Download, FileSpreadsheet, FileText, FileType2, Info, SearchX, Wallet } from 'lucide-react';
import { qs, useFinanceConfig, useFinanceReport, type ReportColumn } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { ApiError, downloadFile } from '../../../../../lib/api-client';
import { formatMinor } from '../../../../../lib/currency';
import { TABLE } from '../../../../../lib/table-styles';
import { ClassSectionFilters, DateRangeFilters, FILTER_PANEL, RESULT_PANEL, formatDay } from '../../../../../components/finance/finance-ui';

const REPORTS: { id: string; label: string; group: string; description: string }[] = [
  { id: 'summary', label: 'Collection summary', group: 'Collection', description: 'Received, refunded, discounts and what is still owed.' },
  { id: 'daily-collection', label: 'Daily collection', group: 'Collection', description: 'What was collected each day.' },
  { id: 'monthly-collection', label: 'Monthly collection', group: 'Collection', description: 'What was collected each month.' },
  { id: 'by-class', label: 'By class', group: 'Collection', description: 'Billed, collected and outstanding per class.' },
  { id: 'by-section', label: 'By section', group: 'Collection', description: 'Billed, collected and outstanding per section.' },
  { id: 'transactions', label: 'Transactions', group: 'Collection', description: 'Every payment, one row each.' },
  { id: 'payment-method', label: 'By payment method', group: 'Collection', description: 'Collection split by how it was paid.' },
  { id: 'cash-collection', label: 'Cash collection', group: 'Collection', description: 'Cash taken each day, by who collected it.' },
  { id: 'outstanding', label: 'Outstanding fees', group: 'Dues', description: 'Every fee that still has a balance.' },
  { id: 'overdue', label: 'Overdue fees', group: 'Dues', description: 'Unpaid fees past their due date.' },
  { id: 'refunds', label: 'Refunds', group: 'Adjustments', description: 'Refund requests and how they ended.' },
  { id: 'concessions', label: 'Discounts & concessions', group: 'Adjustments', description: 'Discounts and concessions given.' },
  { id: 'scholarships', label: 'Scholarships', group: 'Adjustments', description: 'Scholarships awarded.' },
  { id: 'online-payments', label: 'Online payments', group: 'Online', description: 'Switches on with a payment gateway.' },
  { id: 'failed-payments', label: 'Failed payments', group: 'Online', description: 'Switches on with a payment gateway.' },
];

function cell(value: string | number | null, column: ReportColumn): string {
  if (value === null || value === '') return '—';
  if (column.type === 'money' && typeof value === 'number') return formatMinor(value);
  if (column.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  return String(value);
}

function ReportsView() {
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useCan();
  const { data: config } = useFinanceConfig();
  const initial = REPORTS.some((r) => r.id === params.get('kind')) ? (params.get('kind') as string) : 'summary';
  const [kind, setKind] = useState(initial);
  const [range, setRange] = useState({ from: '', to: '' });
  const [cls, setCls] = useState({ classId: '', sectionId: '' });
  const [method, setMethod] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  const filters = { from: range.from || undefined, to: range.to || undefined, classId: cls.classId || undefined, sectionId: cls.sectionId || undefined, method: method || undefined };
  const { data: report, isLoading, isError } = useFinanceReport(kind, filters);
  const current = REPORTS.find((r) => r.id === kind);
  const usesMethod = ['transactions', 'daily-collection', 'monthly-collection', 'summary'].includes(kind);

  const doExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      await downloadFile(`/finance/reports/${kind}/export${qs({ ...filters, format })}`, `finance-${kind}.${format}`);
      toast.show({ tone: 'success', title: 'Export ready', description: 'This export is recorded in the finance activity log.' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not export', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  };

  const groups = [...new Set(REPORTS.map((r) => r.group))];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Finance"
        title="Finance reports"
        description="Pick a report, narrow it down, and export it. Exports are recorded in the activity log."
        action={
          can('financeReport.export') && (
            <>
              <Button variant="secondary" onClick={() => doExport('csv')} loading={exporting === 'csv'} disabled={!report}>
                <FileText size={16} /> CSV
              </Button>
              <Button variant="secondary" onClick={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={!report}>
                <FileSpreadsheet size={16} /> Excel
              </Button>
              <Button variant="secondary" onClick={() => doExport('pdf')} loading={exporting === 'pdf'} disabled={!report}>
                <FileType2 size={16} /> PDF
              </Button>
            </>
          )
        }
      />

      <div className={`${FILTER_PANEL} mt-6`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <SelectField label="Report" value={kind} onChange={(e) => setKind(e.target.value)} helperText={current?.description}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        </div>
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangeFilters from={range.from} to={range.to} onChange={setRange} />
          <ClassSectionFilters classId={cls.classId} sectionId={cls.sectionId} onChange={setCls} />
          {usesMethod && (
            <SelectField fieldSize="sm" aria-label="Payment method" leftIcon={<Wallet size={16} />} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {(config?.paymentMethods ?? [{ value: 'CASH', label: 'Cash' }]).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </SelectField>
          )}
          {(range.from || range.to || cls.classId || method) && (
            <Button variant="secondary" onClick={() => { setRange({ from: '', to: '' }); setCls({ classId: '', sectionId: '' }); setMethod(''); }}>
              Clear filters
            </Button>
          )}
        </div>
        {['outstanding', 'overdue'].includes(kind) && (range.from || range.to) && <p className="mt-3 text-xs text-slate-500">Dates don’t apply here — this report is always as of today.</p>}
      </div>

      <div className={RESULT_PANEL}>
        {isError && <Alert variant="error">We couldn’t build this report. Please try again.</Alert>}
        {isLoading && <Skeleton className="h-48 w-full rounded-xl" />}
        {report && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-navy">{report.title}</h2>
              <p className="text-xs text-slate-400">{report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'}</p>
            </div>
            {report.note && (
              <Alert variant="info" className="mb-4">
                <span className="inline-flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0" /> {report.note}</span>
              </Alert>
            )}
            {report.rows.length === 0 ? (
              !report.note && <EmptyState icon={<SearchX size={22} />} title="Nothing to show" description="No records match these filters." />
            ) : (
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[40rem]`}>
                  <thead className={TABLE.head}>
                    <tr>
                      {report.columns.map((c) => (
                        <th key={c.key} className={c.type === 'money' || c.type === 'number' ? TABLE.thRight : TABLE.th}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={TABLE.body}>
                    {report.rows.slice(0, 500).map((row, i) => (
                      <tr key={i} className={TABLE.row}>
                        {report.columns.map((c) => (
                          <td key={c.key} className={c.type === 'money' || c.type === 'number' ? `${TABLE.tdRight} tabular-nums` : TABLE.td}>{cell(row[c.key], c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.rows.length > 500 && <p className="mt-3 text-xs text-slate-500">Showing the first 500 rows. <Download size={12} className="inline" /> Export to get all {report.rows.length}.</p>}
            {report.totals.length > 0 && (
              <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2 border-t border-slate-100 pt-4">
                {report.totals.map((t) => (
                  <div key={t.label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.label}</dt>
                    <dd className="text-lg font-extrabold text-navy">{t.type === 'money' ? formatMinor(t.value) : t.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function FinanceReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-6xl" />}>
      <ReportsView />
    </Suspense>
  );
}
