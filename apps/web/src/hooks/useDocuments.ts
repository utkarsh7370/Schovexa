import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface StudentDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  createdAt: string;
}

export const studentDocumentsQueryKey = (studentId: string | undefined) => ['student-documents', studentId];

export function useStudentDocuments(studentId: string | undefined) {
  return useQuery({
    queryKey: studentDocumentsQueryKey(studentId),
    queryFn: () => api.get<StudentDocument[]>(`/students/${studentId}/documents`),
    enabled: !!studentId,
  });
}

export interface DocumentConfig {
  maxSizeMb: number;
  allowedTypes: string[];
  categories: string[];
  requiredStudentDocuments: string[];
}

export const DOCUMENT_CONFIG_QUERY_KEY = ['documents', 'config'];

export function useDocumentConfig() {
  return useQuery({ queryKey: DOCUMENT_CONFIG_QUERY_KEY, queryFn: () => api.get<DocumentConfig>('/documents/config'), retry: false });
}

const TYPE_LABELS: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG' };

/** "PDF, JPEG or PNG" — the file types a school accepts, in words. */
export function describeAllowedTypes(types: string[]): string {
  const labels = types.map((t) => TYPE_LABELS[t] ?? t);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}
