import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface StudentDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
