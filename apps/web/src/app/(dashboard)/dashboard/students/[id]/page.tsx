'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { linkParentSchema, type LinkParentInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, Spinner, ConfirmDialog, Badge, PageHeader, EmptyState, useToast } from '@schovexa/ui';
import { ArrowLeft, UserRound, FileText, ClipboardCheck, Wallet } from 'lucide-react';
import { useStudent, studentQueryKey, type StudentStatus } from '../../../../../hooks/useStudents';
import { useParents } from '../../../../../hooks/useParents';
import { useStudentDocuments, studentDocumentsQueryKey } from '../../../../../hooks/useDocuments';
import { useAttendanceHistory } from '../../../../../hooks/useAttendance';
import { useFeeStructures, useStudentFees, studentFeesQueryKey } from '../../../../../hooks/useFees';
import { formatMinor, majorToMinor } from '../../../../../lib/currency';
import { api, ApiError } from '../../../../../lib/api-client';

const STATUS_OPTIONS: StudentStatus[] = ['ENROLLED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN'];
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: student, isLoading } = useStudent(id);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: StudentStatus) => {
    setBusy(true);
    try {
      await api.patch(`/students/${id}`, { status });
      await queryClient.invalidateQueries({ queryKey: studentQueryKey(id) });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !student) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/students" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy">
        <ArrowLeft size={16} /> Back to students
      </Link>

      <div className="mt-3">
        <PageHeader
          title={`${student.firstName} ${student.lastName}`}
          description={`Admission no. ${student.admissionNo}${
            student.section ? ` · ${student.section.class.name} - ${student.section.name}` : ''
          }`}
          action={
            <select
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              value={student.status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value as StudentStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          }
        />
      </div>

      <div className="mt-6">
        <ParentsPanel studentId={id} linkedParents={student.parents} />
      </div>

      <div className="mt-6">
        <FeesPanel studentId={id} />
      </div>

      <div className="mt-6">
        <AttendancePanel studentId={id} />
      </div>

      <div className="mt-6">
        <DocumentsPanel studentId={id} />
      </div>
    </div>
  );
}

function ParentsPanel({
  studentId,
  linkedParents,
}: {
  studentId: string;
  linkedParents: { id: string; relation: string; isPrimary: boolean; parent: { id: string; firstName: string; lastName: string } }[];
}) {
  const { data: parents } = useParents();
  const queryClient = useQueryClient();
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
      reset();
      setLinking(false);
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
    } finally {
      setBusyParentId(null);
      setConfirmingUnlink(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Parents / Guardians</h2>
        {!linking && (
          <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>
            Link parent
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {linkedParents.map((link) => (
          <div key={link.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-sm text-navy">
              {link.parent.firstName} {link.parent.lastName} · {link.relation}
              {link.isPrimary && <span className="ml-2 text-xs font-semibold text-brand-blue">Primary</span>}
            </p>
            <Button
              size="sm"
              variant="danger"
              loading={busyParentId === link.parent.id}
              onClick={() =>
                setConfirmingUnlink({ id: link.parent.id, name: `${link.parent.firstName} ${link.parent.lastName}` })
              }
            >
              Unlink
            </Button>
          </div>
        ))}
        {linkedParents.length === 0 && !linking && <EmptyState icon={<UserRound size={22} />} title="No parents linked yet" />}
      </div>

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

      {linking && (
        <form onSubmit={handleSubmit(onLink)} className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-navy">Parent</label>
            <select
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              {...register('parentId')}
            >
              <option value="">Select a parent</option>
              {availableParents?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
            {errors.parentId && <p className="text-sm text-red-600">{errors.parentId.message}</p>}
            {availableParents?.length === 0 && (
              <p className="text-sm text-slate-500">
                No unlinked parent profiles.{' '}
                <Link href="/dashboard/parents" className="font-medium underline">
                  Create one first.
                </Link>
              </p>
            )}
          </div>
          <TextField label="Relation" placeholder="Mother, Father, Guardian" error={errors.relation?.message} {...register('relation')} />
          <label className="flex items-center gap-2 text-sm text-navy">
            <input type="checkbox" {...register('isPrimary')} />
            Primary contact
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Link
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setLinking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function DocumentsPanel({ studentId }: { studentId: string }) {
  const { data: documents } = useStudentDocuments(studentId);
  const queryClient = useQueryClient();
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
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Documents</h2>
        <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
          Upload document
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
      </div>

      {serverError && (
        <Alert variant="error" className="mt-3">
          {serverError}
        </Alert>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {documents?.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <a
              href={`${API_URL}/documents/${doc.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-blue hover:underline"
            >
              {doc.fileName}
            </a>
            <Button size="sm" variant="danger" loading={busyDocId === doc.id} onClick={() => removeDoc(doc.id)}>
              Delete
            </Button>
          </div>
        ))}
        {documents?.length === 0 && <EmptyState icon={<FileText size={22} />} title="No documents uploaded yet" />}
      </div>
      <p className="mt-3 text-xs text-slate-400">PDF, JPEG, or PNG. Max 10MB.</p>
    </Card>
  );
}

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
};
const ATTENDANCE_STATUS_TONES: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  EXCUSED: 'neutral',
};

function AttendancePanel({ studentId }: { studentId: string }) {
  const [from] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: history } = useAttendanceHistory(studentId, from, to);

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-navy">Attendance (last 30 days)</h2>
      <div className="mt-4 flex flex-col gap-1">
        {history?.map((record) => (
          <div key={record.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-navy">{new Date(record.date).toLocaleDateString()}</span>
            <Badge tone={ATTENDANCE_STATUS_TONES[record.status] ?? 'neutral'}>
              {ATTENDANCE_STATUS_LABELS[record.status] ?? record.status}
            </Badge>
            {record.remarks && <span className="text-slate-500">{record.remarks}</span>}
          </div>
        ))}
        {history?.length === 0 && <EmptyState icon={<ClipboardCheck size={22} />} title="No attendance recorded yet" />}
      </div>
    </Card>
  );
}

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
const FEE_STATUS_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
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
    if (!selectedStructureId) return;
    setServerError(null);
    setBusyId('assign');
    try {
      await api.post(`/students/${studentId}/fees`, { feeStructureId: selectedStructureId });
      await queryClient.invalidateQueries({ queryKey: studentFeesQueryKey(studentId) });
      setSelectedStructureId('');
      setAssigning(false);
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
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Fees</h2>
        {!assigning && (
          <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>
            Assign fee
          </Button>
        )}
      </div>

      {serverError && (
        <Alert variant="error" className="mt-3">
          {serverError}
        </Alert>
      )}

      {assigning && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <select
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
            value={selectedStructureId}
            onChange={(e) => setSelectedStructureId(e.target.value)}
          >
            <option value="">Select a fee structure</option>
            {availableStructures?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.feeCategory.name} · {formatMinor(s.amountMinor)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" loading={busyId === 'assign'} onClick={assign}>
              Assign
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAssigning(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {fees?.map((fee) => (
          <div key={fee.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-navy">
                  {fee.feeCategory.name} · Due {formatMinor(fee.amountDueMinor)}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    Paid {formatMinor(fee.paidMinor)} · Balance {formatMinor(fee.balanceMinor)}
                  </span>
                  <Badge tone={FEE_STATUS_TONES[fee.status] ?? 'neutral'}>{FEE_STATUS_LABELS[fee.status] ?? fee.status}</Badge>
                </p>
              </div>
              {fee.status !== 'WAIVED' && fee.status !== 'PAID' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPayingId(payingId === fee.id ? null : fee.id)}>
                    Record payment
                  </Button>
                  <Button size="sm" variant="danger" loading={busyId === fee.id} onClick={() => setConfirmingWaive(fee.id)}>
                    Waive
                  </Button>
                </div>
              )}
            </div>
            {payingId === fee.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount (₹)"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="h-8 w-32 rounded-md border border-slate-300 px-2 text-xs focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
                  className="h-8 rounded-md border border-slate-300 px-2 text-xs focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
                <Button size="sm" loading={busyId === fee.id} onClick={() => recordPayment(fee.id)}>
                  Save
                </Button>
              </div>
            )}
          </div>
        ))}
        {fees?.length === 0 && !assigning && <EmptyState icon={<Wallet size={22} />} title="No fees assigned yet" />}
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
    </Card>
  );
}
