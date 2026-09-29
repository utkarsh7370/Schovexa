'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { linkParentSchema, type LinkParentInput } from '@schovexa/validation';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  Skeleton,
  StatCard,
  Tabs,
  TextField,
  useToast,
  type BadgeTone,
} from '@schovexa/ui';
import {
  Cake,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Hash,
  IdCard,
  Link2,
  Percent,
  Phone,
  School,
  Trash2,
  Upload,
  UserRound,
  UserRoundPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useStudent, studentQueryKey, type StudentDetail, type StudentStatus } from '../../../../../hooks/useStudents';
import { useParents } from '../../../../../hooks/useParents';
import { useStudentDocuments, studentDocumentsQueryKey } from '../../../../../hooks/useDocuments';
import { useAttendanceHistory, type AttendanceStatus } from '../../../../../hooks/useAttendance';
import { useFeeStructures, useStudentFees, studentFeesQueryKey } from '../../../../../hooks/useFees';
import { formatMinor, majorToMinor } from '../../../../../lib/currency';
import { api, ApiError } from '../../../../../lib/api-client';
import { ProfileHero } from '../../../../../components/profile-hero';
import { SectionCard } from '../../../../../components/section-card';
import { ageFromDob, STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../../../components/student-card';

const STATUS_OPTIONS: StudentStatus[] = ['ENROLLED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN'];
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type TabId = 'overview' | 'attendance' | 'fees' | 'documents';

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: student, isLoading, isError } = useStudent(id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');

  // Stats + tab counts share the panels' query keys, so React Query
  // fetches each thing once and the panels reuse the same cache.
  const [range] = useState(() => ({
    from: toDateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
    to: toDateInput(new Date()),
  }));
  const { data: history } = useAttendanceHistory(id, range.from, range.to);
  const { data: fees } = useStudentFees(id);
  const { data: documents } = useStudentDocuments(id);

  const attendance = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    (history ?? []).forEach((r) => (counts[r.status] += 1));
    const total = history?.length ?? 0;
    // Late still means the child was in school; only Absent/Excused lower the rate.
    const rate = total ? Math.round(((counts.PRESENT + counts.LATE) / total) * 100) : null;
    return { counts, total, rate };
  }, [history]);
  const balanceMinor = (fees ?? []).reduce((sum, f) => sum + f.balanceMinor, 0);

  const setStatus = async (status: StudentStatus) => {
    setBusy(true);
    try {
      await api.patch(`/students/${id}`, { status });
      await queryClient.invalidateQueries({ queryKey: studentQueryKey(id) });
      toast.show({ tone: 'success', title: `Marked as ${STUDENT_STATUS_LABELS[status]}` });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not update status', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="error">We couldn’t find this student, or you don’t have access to their profile.</Alert>
        <Link href="/dashboard/students" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:underline">
          ← Back to students
        </Link>
      </div>
    );
  }

  if (isLoading || !student) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" role="status" aria-label="Loading student">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const fullName = `${student.firstName} ${student.lastName}`;
  const age = ageFromDob(student.dateOfBirth);
  const teacher = student.section?.classTeacher;
  const chips = [
    student.section && { icon: <School size={14} />, label: `${student.section.class.name} · Section ${student.section.name}` },
    teacher && { icon: <GraduationCap size={14} />, label: `Class teacher: ${teacher.user.firstName} ${teacher.user.lastName}` },
    age !== null && { icon: <Cake size={14} />, label: `${age} years old` },
    student.gender && { icon: <UserRound size={14} />, label: student.gender },
  ].filter(Boolean) as { icon: React.ReactNode; label: string }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHero
        backHref="/dashboard/students"
        backLabel="Back to students"
        name={fullName}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Hash size={14} /> Admission no. <span className="font-mono font-bold text-white">{student.admissionNo}</span>
          </span>
        }
        badges={
          <Badge tone={STUDENT_STATUS_TONES[student.status] ?? 'neutral'} dot className="bg-white/95">
            {STUDENT_STATUS_LABELS[student.status] ?? student.status}
          </Badge>
        }
        chips={chips}
        actions={
          <div className="w-44">
            <SelectField
              fieldSize="sm"
              aria-label="Change student status"
              value={student.status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value as StudentStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STUDENT_STATUS_LABELS[s]}
                </option>
              ))}
            </SelectField>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Attendance (30d)"
          tone={attendance.rate === null ? 'default' : attendance.rate >= 90 ? 'emerald' : attendance.rate >= 75 ? 'amber' : 'violet'}
          icon={<Percent size={18} />}
          value={attendance.rate === null ? '—' : `${attendance.rate}%`}
          hint={attendance.total ? `${attendance.counts.PRESENT} present · ${attendance.counts.ABSENT} absent` : 'No records yet'}
        />
        <StatCard
          label="Fee balance"
          tone={balanceMinor > 0 ? 'amber' : 'emerald'}
          icon={<Wallet size={18} />}
          value={fees ? formatMinor(balanceMinor) : '—'}
          hint={balanceMinor > 0 ? 'Payment pending' : fees?.length ? 'All settled' : 'No fees assigned'}
        />
        <StatCard label="Parents linked" tone="blue" icon={<Users size={18} />} value={student.parents.length} hint={student.parents.some((l) => l.isPrimary) ? 'Primary contact set' : 'No primary contact'} />
        <StatCard label="Documents" tone="violet" icon={<FileText size={18} />} value={documents?.length ?? '—'} hint="PDF, JPEG or PNG" />
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as TabId)}
        tabs={[
          { id: 'overview', label: 'Overview', icon: <IdCard size={16} /> },
          { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} />, count: attendance.total || undefined },
          { id: 'fees', label: 'Fees', icon: <Wallet size={16} />, count: fees?.length || undefined },
          { id: 'documents', label: 'Documents', icon: <FileText size={16} />, count: documents?.length || undefined },
        ]}
      />

      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="animate-fade-in-up">
        {tab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <DetailsPanel student={student} age={age} />
            </div>
            <div className="lg:col-span-3">
              <ParentsPanel studentId={id} linkedParents={student.parents} />
            </div>
          </div>
        )}
        {tab === 'attendance' && <AttendancePanel history={history} range={range} counts={attendance.counts} rate={attendance.rate} />}
        {tab === 'fees' && <FeesPanel studentId={id} />}
        {tab === 'documents' && <DocumentsPanel studentId={id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DetailsPanel({ student, age }: { student: StudentDetail; age: number | null }) {
  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Hash size={16} />, label: 'Admission no.', value: <span className="font-mono">{student.admissionNo}</span> },
    { icon: <Cake size={16} />, label: 'Date of birth', value: student.dateOfBirth ? `${new Date(student.dateOfBirth).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}${age !== null ? ` (${age} yrs)` : ''}` : '—' },
    { icon: <UserRound size={16} />, label: 'Gender', value: student.gender || '—' },
    { icon: <School size={16} />, label: 'Class', value: student.section ? student.section.class.name : 'Not assigned yet' },
    { icon: <ClipboardCheck size={16} />, label: 'Section', value: student.section ? `Section ${student.section.name}` : '—' },
    {
      icon: <GraduationCap size={16} />,
      label: 'Class teacher',
      value: student.section?.classTeacher ? `${student.section.classTeacher.user.firstName} ${student.section.classTeacher.user.lastName}` : '—',
    },
  ];
  return (
    <SectionCard icon={<IdCard size={18} />} title="Student details" description="Personal and class information.">
      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <dt className="flex items-center gap-2.5 text-sm text-slate-500">
              <span className="text-slate-400">{row.icon}</span>
              {row.label}
            </dt>
            <dd className="text-right text-sm font-semibold text-navy">{row.value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ParentsPanel({
  studentId,
  linkedParents,
}: {
  studentId: string;
  linkedParents: StudentDetail['parents'];
}) {
  const { data: parents } = useParents();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [linking, setLinking] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyParentId, setBusyParentId] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState<{ id: string; name: string } | null>(null);

  const linkedParentIds = new Set(linkedParents.map((l) => l.parent.id));
  const availableParents = parents?.filter((p) => !linkedParentIds.has(p.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LinkParentInput>({ resolver: zodResolver(linkParentSchema), defaultValues: { isPrimary: false } });

  const onLink = async (data: LinkParentInput) => {
    setServerError(null);
    try {
      await api.post(`/students/${studentId}/parents`, data);
      await queryClient.invalidateQueries({ queryKey: studentQueryKey(studentId) });
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      reset();
      setLinking(false);
      toast.show({ tone: 'success', title: 'Parent linked' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not link parent.');
    }
  };

  const unlink = async () => {
    if (!confirmingUnlink) return;
    setBusyParentId(confirmingUnlink.id);
    try {
      await api.delete(`/students/${studentId}/parents/${confirmingUnlink.id}`);
      await queryClient.invalidateQueries({ queryKey: studentQueryKey(studentId) });
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      toast.show({ tone: 'success', title: `${confirmingUnlink.name} unlinked` });
    } finally {
      setBusyParentId(null);
      setConfirmingUnlink(null);
    }
  };

  return (
    <SectionCard
      icon={<Users size={18} />}
      title="Parents & guardians"
      description="Who can see this student’s records."
      action={
        !linking && (
          <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>
            <UserRoundPlus size={15} /> Link parent
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {linkedParents.map((link) => {
          const name = `${link.parent.firstName} ${link.parent.lastName}`;
          return (
            <div key={link.id} className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-colors hover:border-brand-blue/30 hover:bg-white">
              <Avatar name={name} tone="auto" size={42} />
              <Link href={`/dashboard/parents/${link.parent.id}`} className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-navy group-hover:text-brand-blue">
                  {name}
                  {link.isPrimary && <Badge tone="brand">Primary</Badge>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span className="font-medium">{link.relation}</span>
                  {link.parent.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={11} /> {link.parent.phone}
                    </span>
                  )}
                </p>
              </Link>
              <Button
                size="sm"
                variant="soft-danger"
                aria-label={`Unlink ${name}`}
                loading={busyParentId === link.parent.id}
                onClick={() => setConfirmingUnlink({ id: link.parent.id, name })}
              >
                <Link2 size={14} /> Unlink
              </Button>
            </div>
          );
        })}
        {linkedParents.length === 0 && !linking && (
          <EmptyState icon={<UserRound size={22} />} title="No parents linked yet" description="Link a parent so they can follow attendance, fees and notices." />
        )}
      </div>

      {linking && (
        <form onSubmit={handleSubmit(onLink)} className="mt-4 flex animate-fade-in-up flex-col gap-4 rounded-2xl border border-brand-blue/20 bg-brand-gradient-soft p-4" noValidate>
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <SelectField label="Parent" error={errors.parentId?.message} {...register('parentId')}>
            <option value="">Select a parent</option>
            {availableParents?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </SelectField>
          {availableParents?.length === 0 && (
            <p className="-mt-2 text-sm text-slate-500">
              No unlinked parent profiles.{' '}
              <Link href="/dashboard/parents" className="font-semibold text-brand-blue underline">
                Create one first.
              </Link>
            </p>
          )}
          <TextField label="Relation" placeholder="Mother, Father, Guardian" error={errors.relation?.message} {...register('relation')} />
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-navy">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" {...register('isPrimary')} />
            Primary contact
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Link parent
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setLinking(false);
                setServerError(null);
                reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={!!confirmingUnlink}
        title={`Unlink ${confirmingUnlink?.name ?? 'this parent'}?`}
        description="They will no longer be able to see this student's attendance, fees, or records."
        confirmLabel="Unlink"
        tone="danger"
        loading={busyParentId === confirmingUnlink?.id}
        onConfirm={unlink}
        onCancel={() => setConfirmingUnlink(null)}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
};
const ATTENDANCE_TONES: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  EXCUSED: 'neutral',
};
const ATTENDANCE_CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-400',
  ABSENT: 'bg-red-400',
  LATE: 'bg-amber-400',
  EXCUSED: 'bg-slate-400',
};

function AttendancePanel({
  history,
  range,
  counts,
  rate,
}: {
  history: { id: string; date: string; status: AttendanceStatus; remarks: string | null }[] | undefined;
  range: { from: string; to: string };
  counts: Record<AttendanceStatus, number>;
  rate: number | null;
}) {
  // One cell per calendar day of the window, so gaps (weekends, holidays,
  // unmarked days) are visible as gaps rather than silently skipped.
  const days = useMemo(() => {
    const byDate = new Map((history ?? []).map((r) => [r.date.slice(0, 10), r]));
    const start = new Date(`${range.from}T00:00:00`);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
      return { key, date: d, record: byDate.get(key) };
    });
  }, [history, range.from]);
  const recent = [...(history ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <SectionCard icon={<CalendarCheck size={18} />} title="Attendance" description="The last 30 days, day by day.">
      {history && history.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={22} />} title="No attendance recorded yet" description="Once teachers mark attendance, it will appear here." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(counts) as AttendanceStatus[]).map((s) => (
              <Badge key={s} tone={ATTENDANCE_TONES[s]} dot>
                {counts[s]} {ATTENDANCE_LABELS[s]}
              </Badge>
            ))}
            {rate !== null && <span className="ml-auto text-sm font-semibold text-navy">{rate}% attendance</span>}
          </div>

          {rate !== null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700" style={{ width: `${rate}%` }} />
            </div>
          )}

          <div className="mt-5 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5 md:grid-cols-[repeat(30,minmax(0,1fr))]">
            {days.map(({ key, date, record }) => (
              <div
                key={key}
                title={`${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${record ? ATTENDANCE_LABELS[record.status] : 'No record'}`}
                className={[
                  'aspect-square rounded-md transition-transform hover:scale-125',
                  record ? ATTENDANCE_CELL[record.status] : 'bg-slate-100',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {(Object.keys(ATTENDANCE_CELL) as AttendanceStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={['h-2.5 w-2.5 rounded-sm', ATTENDANCE_CELL[s]].join(' ')} /> {ATTENDANCE_LABELS[s]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-100 ring-1 ring-inset ring-slate-200" /> No record
            </span>
          </div>

          <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {recent.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium text-navy">{new Date(record.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                {record.remarks && <span className="hidden flex-1 truncate text-slate-500 sm:block">{record.remarks}</span>}
                <Badge tone={ATTENDANCE_TONES[record.status]}>{ATTENDANCE_LABELS[record.status]}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

const PAYMENT_METHODS = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE'] as const;
const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};
const FEE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  WAIVED: 'Waived',
};
const FEE_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  PARTIALLY_PAID: 'info',
  PAID: 'success',
  WAIVED: 'neutral',
};

function FeesPanel({ studentId }: { studentId: string }) {
  const { data: fees } = useStudentFees(studentId);
  const { data: structures } = useFeeStructures();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [assigning, setAssigning] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmingWaive, setConfirmingWaive] = useState<string | null>(null);

  const assignedStructureIds = new Set(fees?.map((f) => f.feeStructureId));
  const availableStructures = structures?.filter((s) => !assignedStructureIds.has(s.id));

  const assign = async () => {
    if (!selectedStructureId) {
      setServerError('Choose a fee structure to assign.');
      return;
    }
    setServerError(null);
    setBusyId('assign');
    try {
      await api.post(`/students/${studentId}/fees`, { feeStructureId: selectedStructureId });
      await queryClient.invalidateQueries({ queryKey: studentFeesQueryKey(studentId) });
      setSelectedStructureId('');
      setAssigning(false);
      toast.show({ tone: 'success', title: 'Fee assigned' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not assign fee.');
    } finally {
      setBusyId(null);
    }
  };

  const waive = async () => {
    if (!confirmingWaive) return;
    setBusyId(confirmingWaive);
    try {
      await api.patch(`/student-fees/${confirmingWaive}/waive`);
      await queryClient.invalidateQueries({ queryKey: studentFeesQueryKey(studentId) });
      toast.show({ tone: 'success', title: 'Fee waived' });
    } finally {
      setBusyId(null);
      setConfirmingWaive(null);
    }
  };

  const recordPayment = async (feeId: string) => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setServerError('Enter a valid payment amount.');
      return;
    }
    setServerError(null);
    setBusyId(feeId);
    try {
      const payment = await api.post<{ receipt: { receiptNo: string } | null }>(`/student-fees/${feeId}/payments`, {
        amountMinor: majorToMinor(amount),
        method: paymentMethod,
      });
      await queryClient.invalidateQueries({ queryKey: studentFeesQueryKey(studentId) });
      setPayingId(null);
      setPaymentAmount('');
      toast.show({
        tone: 'success',
        title: 'Payment recorded',
        description: payment.receipt ? `Receipt #${payment.receipt.receiptNo}` : undefined,
      });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      icon={<Wallet size={18} />}
      title="Fees"
      description="What’s due, what’s paid, and what’s left."
      action={
        !assigning && (
          <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>
            Assign fee
          </Button>
        )
      }
    >
      {serverError && (
        <Alert variant="error" className="mb-4">
          {serverError}
        </Alert>
      )}

      {assigning && (
        <div className="mb-4 flex animate-fade-in-up flex-col gap-3 rounded-2xl border border-brand-blue/20 bg-brand-gradient-soft p-4">
          <SelectField aria-label="Fee structure" value={selectedStructureId} onChange={(e) => setSelectedStructureId(e.target.value)}>
            <option value="">Select a fee structure</option>
            {availableStructures?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.feeCategory.name} · {formatMinor(s.amountMinor)}
              </option>
            ))}
          </SelectField>
          <div className="flex gap-2">
            <Button size="sm" loading={busyId === 'assign'} onClick={assign}>
              Assign
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setAssigning(false); setServerError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {fees?.map((fee) => {
          const pct = fee.amountDueMinor > 0 ? Math.min(100, Math.round((fee.paidMinor / fee.amountDueMinor) * 100)) : 0;
          const open = fee.status !== 'WAIVED' && fee.status !== 'PAID';
          return (
            <div key={fee.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-colors hover:bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-navy">
                    {fee.feeCategory.name}
                    <Badge tone={FEE_STATUS_TONES[fee.status] ?? 'neutral'}>{FEE_STATUS_LABELS[fee.status] ?? fee.status}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Due <span className="font-semibold text-slate-700">{formatMinor(fee.amountDueMinor)}</span> · Paid{' '}
                    <span className="font-semibold text-emerald-600">{formatMinor(fee.paidMinor)}</span> · Balance{' '}
                    <span className={['font-semibold', fee.balanceMinor > 0 ? 'text-amber-600' : 'text-slate-700'].join(' ')}>{formatMinor(fee.balanceMinor)}</span>
                  </p>
                </div>
                {open && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPayingId(payingId === fee.id ? null : fee.id)}>
                      Record payment
                    </Button>
                    <Button size="sm" variant="soft-danger" loading={busyId === fee.id && payingId !== fee.id} onClick={() => setConfirmingWaive(fee.id)}>
                      Waive
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-electric to-brand-blue transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              {payingId === fee.id && (
                <div className="mt-4 grid animate-fade-in-up grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <TextField
                    label="Amount (₹)"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                  <SelectField label="Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </SelectField>
                  <Button loading={busyId === fee.id} onClick={() => recordPayment(fee.id)}>
                    Save payment
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {fees?.length === 0 && !assigning && (
          <EmptyState icon={<Wallet size={22} />} title="No fees assigned yet" description="Assign a fee structure to start tracking payments." />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingWaive}
        title="Waive this fee?"
        description="The outstanding balance will be cleared. This is recorded and cannot be undone from here."
        confirmLabel="Waive fee"
        tone="danger"
        loading={busyId === confirmingWaive}
        onConfirm={waive}
        onCancel={() => setConfirmingWaive(null)}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPanel({ studentId }: { studentId: string }) {
  const { data: documents } = useStudentDocuments(studentId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setServerError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.postForm(`/students/${studentId}/documents`, formData);
      await queryClient.invalidateQueries({ queryKey: studentDocumentsQueryKey(studentId) });
      toast.show({ tone: 'success', title: 'Document uploaded', description: file.name });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not upload document.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDoc = async (docId: string) => {
    setBusyDocId(docId);
    try {
      await api.delete(`/documents/${docId}`);
      await queryClient.invalidateQueries({ queryKey: studentDocumentsQueryKey(studentId) });
      toast.show({ tone: 'success', title: 'Document deleted' });
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <SectionCard
      icon={<FileText size={18} />}
      title="Documents"
      description="Birth certificate, transfer certificate, report cards…"
      action={
        <>
          <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} /> Upload document
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </>
      }
    >
      {serverError && (
        <Alert variant="error" className="mb-4">
          {serverError}
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        {documents?.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-colors hover:border-brand-blue/30 hover:bg-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-blue shadow-card">
              <FileText size={18} />
            </span>
            <a href={`${API_URL}/documents/${doc.id}/download`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy hover:text-brand-blue">{doc.fileName}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </a>
            <Button size="sm" variant="soft-danger" aria-label={`Delete ${doc.fileName}`} loading={busyDocId === doc.id} onClick={() => removeDoc(doc.id)}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        ))}
        {documents?.length === 0 && (
          <EmptyState
            icon={<FileText size={22} />}
            title="No documents uploaded yet"
            description="PDF, JPEG or PNG, up to 10 MB each."
            action={
              <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} /> Upload the first one
              </Button>
            }
          />
        )}
      </div>
      {documents && documents.length > 0 && <p className="mt-4 text-xs text-slate-400">PDF, JPEG, or PNG. Max 10MB.</p>}
    </SectionCard>
  );
}
