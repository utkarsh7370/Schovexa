import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
}

export const SUBJECTS_QUERY_KEY = ['subjects'];

export function useSubjects() {
  return useQuery({ queryKey: SUBJECTS_QUERY_KEY, queryFn: () => api.get<Subject[]>('/subjects') });
}
