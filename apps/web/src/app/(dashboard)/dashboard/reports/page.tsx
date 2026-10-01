'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  Skeleton,
  StatCard,
  Tabs,
  TextField,
  type BadgeTone,
} from '@schovexa/ui';
import { BadgeIndianRupee, BarChart3, CalendarCheck, Download, FileSpreadsheet, HandCoins, IdCard, Layers, Percent, School, Shapes, Sunrise, Tag, Users, Wallet } from 'lucide-react';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useFeeCategories } from '../../../../hooks/useFees';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { useStudentReport, useAttendanceReport, useFeeReport } from '../../../../hooks/useReports';
import { formatMinor } from '../../../../lib/currency';
import { downloadLinkClass, TABLE } from '../../../../lib/table-styles';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../../components/student-card';
import { SchoolDayBadge } from '../../../../components/school-day-badge';
import { SCHOOL_DAY_OPTIONS, isHalfDay } from '../../../../lib/school-day';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const PAGE_SIZES = [10, 20, 50];

const FEE_STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', WAIVED: 'Waived' };
const FEE_STATUS_TONES: Record<string, BadgeTone> = { PENDING: 'warning', PARTIALLY_PAID: 'info', PAID: 'success', WAIVED: 'neutral' };

type ReportTab = 'students' | 'attendance' | 'fees';

const toLocalIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayIso = () => toLocalIso(new Date());
const daysAgoIso = (n: number) => toLocalIso(new Date(Date.now() - n * 86_400_000));

function queryString(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `?${qs}` : '';
}

function ExportLink({ href }: { href: string }) {
  return (
    <a href={href} className={downloadLinkClass()}>
      <Download size={16} /> Export CSV
    </a>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading report">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('students');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="School-wide student, attendance and fee reports. Search, filter, and export exactly what you see to CSV."
      />

      <Tabs
        className="mt-6 w-fit max-w-full"
        value={tab}
        onChange={(v) => setTab(v as ReportTab)}
        tabs={[
          { id: 'students', label: 'Students', icon: <IdCard size={16} /> },
          { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} /> },
          { id: 'fees', label: 'Fees', icon: <Wallet size={16} /> },
        ]}
      />

      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6 animate-fade-in-up">
        {tab === 'students' && <StudentsReportPanel />}
        {tab === 'attendance' && <AttendanceReportPanel />}
        {tab === 'fees' && <FeesReportPanel />}
      </div>
    </div>
  );
}

// Filter bar + results frame shared by all three reports.
function ReportFrame({ filters, exportHref, children }: { filters: React.ReactNode; exportHref: string; children: React.ReactNode }) {
  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-3">{filters}</div>
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
          <ExportLink href={exportHref} />
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">{children}</div>
    </>
  );
}

function StudentsReportPanel() {
  const { data: classes } = useClasses();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('');
  const [schoolDay, setSchoolDay] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const debouncedSearch = useDebouncedValue(search.trim());
  const { data: sections } = useSections(classId || undefined);
  const filters = { classId: classId || undefined, sectionId: sectionId || undefined, status: status || undefined, schoolDay: schoolDay || undefined, search: debouncedSearch || undefined };
  const { data, isLoading, isFetching, isError } = useStudentReport(filters, page, pageSize);

  useEffect(() => setPage(1), [debouncedSearch]);

  return (
    <ReportFrame
      exportHref={`${API_URL}/reports/students/export${queryString(filters)}`}
      filters={
        <>
          <SearchInput value={search} onChange={setSearch} busy={isFetching && !isLoading} placeholder="Search by student name or admission number…" aria-label="Search students" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField fieldSize="sm" aria-label="Filter by class" leftIcon={<School size={16} />} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
              <option value="">All classes</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Filter by section" leftIcon={<Shapes size={16} />} disabled={!classId} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
              <option value="">{classId ? 'All sections' : 'Pick a class first'}</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>Section {s.name}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Filter by status" leftIcon={<Users size={16} />} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Any status</option>
              {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Filter by school day" leftIcon={<Sunrise size={16} />} value={schoolDay} onChange={(e) => { setSchoolDay(e.target.value); setPage(1); }}>
              <option value="">Any school day</option>
              {SCHOOL_DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SelectField>
          </div>
        </>
      }
    >
      {isError && <Alert variant="error">We couldn’t load this report. Please try again.</Alert>}
      {isLoading && <TableSkeleton />}
      {!isLoading && data?.data.length === 0 && <EmptyState icon={<FileSpreadsheet size={22} />} title="No students match these filters" description="Try clearing a filter or searching for something else." />}
      {data && data.data.length > 0 && (
        <>
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.head}>
                <tr>
                  <th className={TABLE.th}>Student</th>
                  <th className={TABLE.th}>Admission no.</th>
                  <th className={TABLE.th}>Class</th>
                  <th className={TABLE.th}>Section</th>
                  <th className={TABLE.th}>School day</th>
                  <th className={TABLE.th}>Status</th>
                </tr>
              </thead>
              <tbody className={TABLE.body}>
                {data.data.map((row) => (
                  <tr key={row.studentId} className={TABLE.row}>
                    <td className={TABLE.td}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${row.firstName} ${row.lastName}`} tone="auto" size={32} />
                        <span className="font-semibold text-navy">{row.firstName} {row.lastName}</span>
                      </div>
                    </td>
                    <td className={TABLE.td}><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">{row.admissionNo}</span></td>
                    <td className={`${TABLE.td} text-slate-600`}>{row.className ?? '—'}</td>
                    <td className={`${TABLE.td} text-slate-600`}>{row.sectionName ?? '—'}</td>
                    <td className={TABLE.td}>{isHalfDay(row.schoolDay) ? <SchoolDayBadge value={row.schoolDay} /> : <span className="text-slate-400">Full day</span>}</td>
                    <td className={TABLE.td}>
                      <Badge tone={STUDENT_STATUS_TONES[row.status] ?? 'neutral'} dot>{STUDENT_STATUS_LABELS[row.status] ?? row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="students" pageSizeOptions={PAGE_SIZES} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        </>
      )}
    </ReportFrame>
  );
}

const ATTENDANCE_PRESETS = [
  { label: 'Last 7 days', from: () => daysAgoIso(6) },
  { label: 'Last 30 days', from: () => daysAgoIso(29) },
  { label: 'This month', from: () => `${todayIso().slice(0, 8)}01` },
];

function AttendanceReportPanel() {
  const { data: classes } = useClasses();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [from, setFrom] = useState(daysAgoIso(6));
  const [to, setTo] = useState(todayIso());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const debouncedSearch = useDebouncedValue(search.trim());
  const { data: sections } = useSections(classId || undefined);
  const filters = { classId: classId || undefined, sectionId: sectionId || undefined, from, to, search: debouncedSearch || undefined };
  const { data, isLoading, isFetching, isError } = useAttendanceReport(filters, page, pageSize);

  useEffect(() => setPage(1), [debouncedSearch]);

  return (
    <ReportFrame
      exportHref={`${API_URL}/reports/attendance/export${queryString(filters)}`}
      filters={
        <>
          <SearchInput value={search} onChange={setSearch} busy={isFetching && !isLoading} placeholder="Search by student name or admission number…" aria-label="Search students" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField fieldSize="sm" aria-label="Filter by class" leftIcon={<School size={16} />} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
              <option value="">All classes</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
            <SelectField fieldSize="sm" aria-label="Filter by section" leftIcon={<Shapes size={16} />} disabled={!classId} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
              <option value="">{classId ? 'All sections' : 'Pick a class first'}</option>
              {sections?.map((s) => (
                <option key={s.id} value={s.id}>Section {s.name}</option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_PRESETS.map((p) => {
              const start = p.from();
              const active = from === start && to === todayIso();
              return (
                <button key={p.label} type="button" aria-pressed={active} onClick={() => { setFrom(start); setTo(todayIso()); setPage(1); }} className={['rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'].join(' ')}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="From" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <TextField label="To" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </>
      }
    >
      {isError && <Alert variant="error">We couldn’t load this report. Please try again.</Alert>}
      {isLoading && <TableSkeleton />}
      {!isLoading && data?.data.length === 0 && <EmptyState icon={<BarChart3 size={22} />} title="No students match these filters" description="Try clearing a filter or searching for something else." />}
      {data && data.data.length > 0 && (
        <>
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[44rem]`}>
              <thead className={TABLE.head}>
                <tr>
                  <th className={TABLE.th}>Student</th>
                  <th className={TABLE.th}>Class</th>
                  <th className={TABLE.thCenter}>Present</th>
                  <th className={TABLE.thCenter}>Absent</th>
                  <th className={TABLE.thCenter}>Late</th>
                  <th className={TABLE.thCenter}>Excused</th>
                  <th className={TABLE.th}>Attendance</th>
                </tr>
              </thead>
              <tbody className={TABLE.body}>
                {data.data.map((row) => {
                  const pct = row.attendancePercent;
                  const bar = pct === null ? 'bg-slate-200' : pct >= 90 ? 'from-emerald-400 to-teal-500' : pct >= 75 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-red-500';
                  return (
                    <tr key={row.studentId} className={TABLE.row}>
                      <td className={TABLE.td}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${row.firstName} ${row.lastName}`} tone="auto" size={32} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-navy">{row.firstName} {row.lastName}</p>
                            <p className="font-mono text-[11px] text-slate-400">{row.admissionNo}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${TABLE.td} text-slate-600`}>{row.className ?? '—'} {row.sectionName ? `· ${row.sectionName}` : ''}</td>
                      <td className={`${TABLE.tdCenter} font-semibold text-emerald-600`}>{row.present}</td>
                      <td className={`${TABLE.tdCenter} font-semibold text-red-600`}>{row.absent}</td>
                      <td className={`${TABLE.tdCenter} font-semibold text-amber-600`}>{row.late}</td>
                      <td className={`${TABLE.tdCenter} font-semibold text-slate-500`}>{row.excused}</td>
                      <td className={TABLE.td}>
                        {pct === null ? (
                          <span className="text-xs text-slate-400">No records</span>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <div className={['h-full rounded-full bg-gradient-to-r', bar].join(' ')} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-12 text-xs font-bold text-navy">{pct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="students" pageSizeOptions={PAGE_SIZES} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        </>
      )}
    </ReportFrame>
  );
}

function FeesReportPanel() {
  const { data: categories } = useFeeCategories();
  const [search, setSearch] = useState('');
  const [feeCategoryId, setFeeCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const debouncedSearch = useDebouncedValue(search.trim());
  const filters = { feeCategoryId: feeCategoryId || undefined, status: status || undefined, search: debouncedSearch || undefined };
  const { data, isLoading, isFetching, isError } = useFeeReport(filters, page, pageSize);

  useEffect(() => setPage(1), [debouncedSearch]);
  const rate = data && data.totals.assignedMinor > 0 ? Math.round((data.totals.paidMinor / data.totals.assignedMinor) * 100) : null;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assigned" tone="blue" icon={<Layers size={18} />} value={data ? formatMinor(data.totals.assignedMinor) : <Skeleton className="h-8 w-24" />} hint="Matches your filters" />
        <StatCard label="Collected" tone="emerald" icon={<HandCoins size={18} />} value={data ? formatMinor(data.totals.paidMinor) : <Skeleton className="h-8 w-24" />} />
        <StatCard label="Outstanding" tone="amber" icon={<BadgeIndianRupee size={18} />} value={data ? formatMinor(data.totals.outstandingMinor) : <Skeleton className="h-8 w-24" />} />
        <StatCard label="Collection rate" tone="violet" icon={<Percent size={18} />} value={data ? (rate === null ? '—' : `${rate}%`) : <Skeleton className="h-8 w-16" />} />
      </div>

      <ReportFrame
        exportHref={`${API_URL}/reports/fees/export${queryString(filters)}`}
        filters={
          <>
            <SearchInput value={search} onChange={setSearch} busy={isFetching && !isLoading} placeholder="Search by student, admission number or fee category…" aria-label="Search fees" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField fieldSize="sm" aria-label="Filter by fee category" leftIcon={<Tag size={16} />} value={feeCategoryId} onChange={(e) => { setFeeCategoryId(e.target.value); setPage(1); }}>
                <option value="">All categories</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectField>
              <SelectField fieldSize="sm" aria-label="Filter by payment status" leftIcon={<Wallet size={16} />} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Any status</option>
                {Object.entries(FEE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </SelectField>
            </div>
          </>
        }
      >
        {isError && <Alert variant="error">We couldn’t load this report. Please try again.</Alert>}
        {isLoading && <TableSkeleton />}
        {!isLoading && data?.data.length === 0 && <EmptyState icon={<FileSpreadsheet size={22} />} title="No fee records match" description="Try clearing a filter or searching for something else." />}
        {data && data.data.length > 0 && (
          <>
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[44rem]`}>
                <thead className={TABLE.head}>
                  <tr>
                    <th className={TABLE.th}>Student</th>
                    <th className={TABLE.th}>Category</th>
                    <th className={TABLE.thRight}>Due</th>
                    <th className={TABLE.thRight}>Paid</th>
                    <th className={TABLE.thRight}>Balance</th>
                    <th className={TABLE.th}>Status</th>
                  </tr>
                </thead>
                <tbody className={TABLE.body}>
                  {data.data.map((row) => {
                    const pct = row.amountDueMinor > 0 ? Math.min(100, Math.round((row.paidMinor / row.amountDueMinor) * 100)) : 0;
                    return (
                      <tr key={row.studentFeeId} className={TABLE.row}>
                        <td className={TABLE.td}>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${row.firstName} ${row.lastName}`} tone="auto" size={32} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-navy">{row.firstName} {row.lastName}</p>
                              <p className="font-mono text-[11px] text-slate-400">{row.admissionNo}</p>
                            </div>
                          </div>
                        </td>
                        <td className={`${TABLE.td} text-slate-600`}>{row.feeCategory}</td>
                        <td className={TABLE.tdRight}>{formatMinor(row.amountDueMinor)}</td>
                        <td className={TABLE.tdRight}>
                          <span className="font-semibold text-emerald-600">{formatMinor(row.paidMinor)}</span>
                          <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className={`${TABLE.tdRight} font-semibold ${row.balanceMinor > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{formatMinor(row.balanceMinor)}</td>
                        <td className={TABLE.td}>
                          <Badge tone={FEE_STATUS_TONES[row.status] ?? 'neutral'} dot>{FEE_STATUS_LABELS[row.status] ?? row.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} noun="fee records" pageSizeOptions={PAGE_SIZES} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            </div>
          </>
        )}
      </ReportFrame>
    </>
  );
}
