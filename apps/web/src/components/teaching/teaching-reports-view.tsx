'use client';

import { useState } from 'react';
import { Alert, Button, EmptyState, PageHeader, SelectField, Skeleton, TextField, useToast } from '@schovexa/ui';
import { Download, FileSpreadsheet, FileText, FileType2, Info, SearchX } from 'lucide-react';
import { qs } from '../../hooks/useFinance';
import { useExams, useTeachingOptions, useTeachingReport, type TeachingReport } from '../../hooks/useTeaching';
import { useCan } from '../../hooks/useCan';
import { ApiError, downloadFile } from '../../lib/api-client';
import { TABLE } from '../../lib/table-styles';
import { FILTER_PANEL, RESULT_PANEL, formatDay } from '../finance/finance-ui';

interface ReportDef {
  id: string;
  label: string;
  group: string;
  description: string;
  filters: ('dates' | 'section' | 'subject' | 'exam')[];
}

const REPORTS: ReportDef[] = [
  { id: 'class-attendance', label: 'Class attendance', group: 'Attendance', description: 'Present, absent, late and half days per student, with the percentage.', filters: ['dates', 'section'] },
  { id: 'student-performance', label: 'Student performance', group: 'Marks', description: 'Each student’s marks across published exams, with the average.', filters: ['section', 'exam'] },
  { id: 'exam-performance', label: 'Exam performance', group: 'Marks', description: 'Average, highest, lowest and pass rate per paper.', filters: ['section', 'exam'] },
  { id: 'subject-marks', label: 'Subject-wise marks', group: 'Marks', description: 'Marks for one subject, student by student.', filters: ['section', 'subject', 'exam'] },
  { id: 'class-trends', label: 'Class trends', group: 'Marks', description: 'How a class’s average moved from exam to exam.', filters: ['section', 'subject'] },
  { id: 'homework-completion', label: 'Homework completion', group: 'Coursework', description: 'How much of the homework set has been handed in.', filters: ['dates', 'section', 'subject'] },
  { id: 'assignment-completion', label: 'Assignment completion', group: 'Coursework', description: 'Submissions, reviews and average marks per assignment.', filters: ['dates', 'section', 'subject'] },
  { id: 'student-list', label: 'Student list', group: 'Students', description: 'Roll number, admission number and class for your students.', filters: ['section'] },
];

function cell(value: string | number | null, column: TeachingReport['columns'][number]): string {
  if (value === null || value === '') return '—';
  if (column.type === 'percent' && typeof value === 'number') return `${value}%`;
  if (column.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  return String(value);
}

export function TeachingReportsView() {
  const toast = useToast();
  const { can } = useCan();
  const [kind, setKind] = useState('class-attendance');
  const [range, setRange] = useState({ from: '', to: '' });
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examId, setExamId] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const current = REPORTS.find((r) => r.id === kind)!;
  const uses = (f: ReportDef['filters'][number]) => current.filters.includes(f);

  const { data: options } = useTeachingOptions();
  const { data: exams } = useExams();
  const filters = {
    from: uses('dates') ? range.from || undefined : undefined,
    to: uses('dates') ? range.to || undefined : undefined,
    sectionId: sectionId || undefined,
    subjectId: uses('subject') ? subjectId || undefined : undefined,
    examId: uses('exam') ? examId || undefined : undefined,
  };
  const { data: report, isLoading, isError } = useTeachingReport(kind, filters);

  const doExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      await downloadFile(`/teaching/reports/${kind}/export${qs({ ...filters, format })}`, `${kind}.${format}`);
      toast.show({ tone: 'success', title: 'Export ready', description: 'This export is recorded in the activity log.' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not export', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  };

  const groups = [...new Set(REPORTS.map((r) => r.group))];
  const filtered = Boolean(range.from || range.to || sectionId || subjectId || examId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Insights"
        title="Teaching reports"
        description="Attendance, marks and coursework for the classes you teach."
        action={
          can('teachingReport.export') ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => doExport('csv')} loading={exporting === 'csv'} disabled={!report}><FileText size={16} /> CSV</Button>
              <Button variant="secondary" onClick={() => doExport('xlsx')} loading={exporting === 'xlsx'} disabled={!report}><FileSpreadsheet size={16} /> Excel</Button>
              <Button variant="secondary" onClick={() => doExport('pdf')} loading={exporting === 'pdf'} disabled={!report}><FileType2 size={16} /> PDF</Button>
            </div>
          ) : undefined
        }
      />

      <div className={`${FILTER_PANEL} mt-6`}>
        <SelectField label="Report" value={kind} onChange={(e) => setKind(e.target.value)} helperText={current.description}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {uses('dates') && (
            <>
              <TextField label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <TextField label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </>
          )}
          <SelectField label="Class" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All my classes</option>
            {options?.sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
          {uses('subject') && (
            <SelectField label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {options?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          )}
          {uses('exam') && (
            <SelectField label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">All exams</option>
              {exams?.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </SelectField>
          )}
          {filtered && (
            <Button variant="secondary" onClick={() => { setRange({ from: '', to: '' }); setSectionId(''); setSubjectId(''); setExamId(''); }}>
              Clear filters
            </Button>
          )}
        </div>
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
              !report.note && <EmptyState icon={<SearchX size={22} />} title="Nothing to show" description="No records match these filters yet." />
            ) : (
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[40rem]`}>
                  <thead className={TABLE.head}>
                    <tr>
                      {report.columns.map((c) => (
                        <th key={c.key} className={c.type === 'number' || c.type === 'percent' ? TABLE.thRight : TABLE.th}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={TABLE.body}>
                    {report.rows.slice(0, 500).map((row, i) => (
                      <tr key={i} className={TABLE.row}>
                        {report.columns.map((c) => (
                          <td key={c.key} className={c.type === 'number' || c.type === 'percent' ? `${TABLE.tdRight} tabular-nums` : TABLE.td}>{cell(row[c.key] ?? null, c)}</td>
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
                    <dd className="text-lg font-extrabold text-navy">{t.type === 'percent' ? `${t.value}%` : t.value}</dd>
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
