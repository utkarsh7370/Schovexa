'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { linkParentSchema, type LinkParentInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert, Spinner } from '@schovexa/ui';
import { ArrowLeft } from 'lucide-react';
import { useStudent, studentQueryKey, type StudentStatus } from '../../../../../hooks/useStudents';
import { useParents } from '../../../../../hooks/useParents';
import { useStudentDocuments, studentDocumentsQueryKey } from '../../../../../hooks/useDocuments';
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

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">
            {student.firstName} {student.lastName}
          </h1>
          <p className="mt-1 text-slate-600">
            Admission no. {student.admissionNo}
            {student.section && ` · ${student.section.class.name} - ${student.section.name}`}
          </p>
        </div>
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
      </div>

      <div className="mt-6">
        <ParentsPanel studentId={id} linkedParents={student.parents} />
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

  const unlink = async (parentId: string) => {
    setBusyParentId(parentId);
    try {
      await api.delete(`/students/${studentId}/parents/${parentId}`);
      await queryClient.invalidateQueries({ queryKey: studentQueryKey(studentId) });
    } finally {
      setBusyParentId(null);
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
              onClick={() => unlink(link.parent.id)}
            >
              Unlink
            </Button>
          </div>
        ))}
        {linkedParents.length === 0 && !linking && <p className="text-sm text-slate-500">No parents linked yet.</p>}
      </div>

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
        {documents?.length === 0 && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-400">PDF, JPEG, or PNG. Max 10MB.</p>
    </Card>
  );
}
