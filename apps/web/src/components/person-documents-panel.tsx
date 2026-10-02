'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, EmptyState, useToast } from '@schovexa/ui';
import { FileText, Trash2, Upload } from 'lucide-react';
import { API_URL, api, ApiError } from '../lib/api-client';
import { personDocumentsQueryKey, usePersonDocuments } from '../hooks/useProfile';
import { SectionCard } from './section-card';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface PersonDocumentsPanelProps {
  /** '/me/documents' for your own, `/staff/:membershipId/documents` for someone else's. */
  basePath: string;
  canUpload: boolean;
  canDelete: boolean;
  description?: string;
  /** Called after an upload or delete so a parent can refresh its counts. */
  onChanged?: () => void;
}

// ID proof, certificates, contracts — a person's personal documents. The
// same panel serves "My profile" and the staff/teacher pages; only the API
// path and what the viewer may do differ.
export function PersonDocumentsPanel({ basePath, canUpload, canDelete, description, onChanged }: PersonDocumentsPanelProps) {
  const { data: documents, isLoading } = usePersonDocuments(basePath);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: personDocumentsQueryKey(basePath) });
    onChanged?.();
  };

  const upload = async (file: File) => {
    setServerError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.postForm(basePath, formData);
      await refresh();
      toast.show({ tone: 'success', title: 'Document uploaded', description: file.name });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not upload the document.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setBusyDocId(id);
    try {
      await api.delete(`${basePath}/${id}`);
      await refresh();
      toast.show({ tone: 'success', title: 'Document deleted' });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not delete the document.');
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <SectionCard
      icon={<FileText size={18} />}
      title="Documents"
      description={description ?? 'ID proof, certificates, contracts…'}
      action={
        canUpload && (
          <>
            <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} /> Upload document
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Choose a document to upload"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </>
        )
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
            <a href={`${API_URL}${basePath}/${doc.id}/download`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy hover:text-brand-blue">{doc.fileName}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </a>
            {canDelete && (
              <Button size="sm" variant="soft-danger" aria-label={`Delete ${doc.fileName}`} loading={busyDocId === doc.id} onClick={() => remove(doc.id)}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
          </div>
        ))}
        {!isLoading && documents?.length === 0 && (
          <EmptyState
            icon={<FileText size={22} />}
            title="No documents yet"
            description="PDF, JPEG or PNG, within your school’s size limit."
            action={
              canUpload ? (
                <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} /> Upload the first one
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
      {documents && documents.length > 0 && <p className="mt-4 text-xs text-slate-400">PDF, JPEG or PNG.</p>}
    </SectionCard>
  );
}
