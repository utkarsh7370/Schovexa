'use client';

import { useState } from 'react';
import { PageHeader, Card, Badge, EmptyState, SkeletonRows, Button, type BadgeTone } from '@schovexa/ui';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import {
  useStudentReport,
  useAttendanceReport,
  useFeeReport,
  type PaginationMeta,
} from '../../../../hooks/useReports';
import { formatMinor } from '../../../../lib/currency';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const STUDENT_STATUS_TONES: Record<string, BadgeTone> = {
  ENROLLED: 'success',
  TRANSFERRED: 'info',
  GRADUATED: 'brand',
  WITHDRAWN: 'neutral',
};

const FEE_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  PARTIALLY_PAID: 'info',
  PAID: 'success',
  WAIVED: 'neutral',
};

type ReportTab = 'students' | 'attendance' | 'fees';

const TABS: { value: ReportTab; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'fees', label: 'Fees' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function selectClasses(): string {
  return 'h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue';
}

function ExportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
    >
      <Download size={15} strokeWidth={2} />
      Export CSV
    </a>
  );
}

function Pagination({ pagination, onPage }: { pagination: PaginationMeta; onPage: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('students');

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="School-wide student, attendance, and fee reports — paginated and exportable to CSV."
      />

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={[
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.value ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-navy',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'students' && <StudentsReportPanel />}
        {tab === 'attendance' && <AttendanceReportPanel />}
        {tab === 'fees' && <FeesReportPanel />}
      </div>
    </div>
  );
}

function StudentsReportPanel() {
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data: sections } = useSections(classId || undefined);
  const filters = { classId: classId || undefined, sectionId: sectionId || undefined, status: status || undefined };
  const { data, isLoading } = useStudentReport(filters, page);

  const exportHref = `${API_URL}/reports/students/export?${new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][]),
  ).toString()}`;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Class</label>
            <select
              className={selectClasses()}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Section</label>
            <select
              className={selectClasses()}
              disabled={!classId}
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sections</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Status</label>
            <select
              className={selectClasses()}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="ENROLLED">Enrolled</option>
              <option value="TRANSFERRED">Transferred</option>
              <option value="GRADUATED">Graduated</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>
        </div>
        <ExportLink href={exportHref} />
      </div>

      <div className="mt-5">
        {isLoading && <SkeletonRows count={5} />}
        {!isLoading && data?.data.length === 0 && (
          <EmptyState icon={<FileSpreadsheet size={22} />} title="No students match these filters" />
        )}
        {!isLoading && data && data.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2">Admission No</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Class</th>
                  <th className="py-2">Section</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="py-2 text-navy">{row.admissionNo}</td>
                    <td className="py-2 text-navy">
                      {row.firstName} {row.lastName}
                    </td>
                    <td className="py-2 text-slate-600">{row.className ?? '—'}</td>
                    <td className="py-2 text-slate-600">{row.sectionName ?? '—'}</td>
                    <td className="py-2">
                      <Badge tone={STUDENT_STATUS_TONES[row.status] ?? 'neutral'}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination pagination={data.pagination} onPage={setPage} />}
      </div>
    </Card>
  );
}

function AttendanceReportPanel() {
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const { data: sections } = useSections(classId || undefined);
  const filters = { classId: classId || undefined, sectionId: sectionId || undefined, from, to };
  const { data, isLoading } = useAttendanceReport(filters, page);

  const exportHref = `${API_URL}/reports/attendance/export?${new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][]),
  ).toString()}`;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Class</label>
            <select
              className={selectClasses()}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSectionId('');
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Section</label>
            <select
              className={selectClasses()}
              disabled={!classId}
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sections</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">From</label>
            <input
              type="date"
              className={selectClasses()}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">To</label>
            <input
              type="date"
              className={selectClasses()}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <ExportLink href={exportHref} />
      </div>

      <div className="mt-5">
        {isLoading && <SkeletonRows count={5} />}
        {!isLoading && data?.data.length === 0 && (
          <EmptyState icon={<BarChart3 size={22} />} title="No students match these filters" />
        )}
        {!isLoading && data && data.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2">Student</th>
                  <th className="py-2">Class</th>
                  <th className="py-2 text-center">Present</th>
                  <th className="py-2 text-center">Absent</th>
                  <th className="py-2 text-center">Late</th>
                  <th className="py-2 text-center">Excused</th>
                  <th className="py-2 text-center">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="py-2 text-navy">
                      {row.firstName} {row.lastName}
                      <span className="ml-2 text-xs text-slate-400">{row.admissionNo}</span>
                    </td>
                    <td className="py-2 text-slate-600">
                      {row.className ?? '—'} {row.sectionName ?? ''}
                    </td>
                    <td className="py-2 text-center">{row.present}</td>
                    <td className="py-2 text-center">{row.absent}</td>
                    <td className="py-2 text-center">{row.late}</td>
                    <td className="py-2 text-center">{row.excused}</td>
                    <td className="py-2 text-center font-medium">
                      {row.attendancePercent === null ? '—' : `${row.attendancePercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination pagination={data.pagination} onPage={setPage} />}
      </div>
    </Card>
  );
}

function FeesReportPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useFeeReport({}, page);

  const exportHref = `${API_URL}/reports/fees/export`;

  return (
    <Card className="p-6">
      {data && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Assigned</p>
            <p className="mt-1 text-lg font-bold text-navy">{formatMinor(data.totals.assignedMinor)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Collected</p>
            <p className="mt-1 text-lg font-bold text-green-700">{formatMinor(data.totals.paidMinor)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Outstanding</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{formatMinor(data.totals.outstandingMinor)}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <ExportLink href={exportHref} />
      </div>

      <div className="mt-3">
        {isLoading && <SkeletonRows count={5} />}
        {!isLoading && data?.data.length === 0 && (
          <EmptyState icon={<FileSpreadsheet size={22} />} title="No fee records yet" />
        )}
        {!isLoading && data && data.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2">Student</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Due</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2 text-right">Balance</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.studentFeeId} className="border-t border-slate-100">
                    <td className="py-2 text-navy">
                      {row.firstName} {row.lastName}
                      <span className="ml-2 text-xs text-slate-400">{row.admissionNo}</span>
                    </td>
                    <td className="py-2 text-slate-600">{row.feeCategory}</td>
                    <td className="py-2 text-right">{formatMinor(row.amountDueMinor)}</td>
                    <td className="py-2 text-right">{formatMinor(row.paidMinor)}</td>
                    <td className="py-2 text-right font-medium">{formatMinor(row.balanceMinor)}</td>
                    <td className="py-2">
                      <Badge tone={FEE_STATUS_TONES[row.status] ?? 'neutral'}>{row.status.replace('_', ' ')}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination pagination={data.pagination} onPage={setPage} />}
      </div>
    </Card>
  );
}
