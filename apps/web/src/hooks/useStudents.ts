import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type StudentStatus = 'ENROLLED' | 'TRANSFERRED' | 'GRADUATED' | 'WITHDRAWN';

export interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  sectionId: string | null;
  status: StudentStatus;
}

export interface StudentParentLink {
  id: string;
  relation: string;
  isPrimary: boolean;
  parent: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
}

export interface StudentDetail extends Student {
  section: { id: string; name: string; class: { id: string; name: string } } | null;
  parents: StudentParentLink[];
}

export const STUDENTS_QUERY_KEY = ['students'];
export const studentQueryKey = (id: string | undefined) => ['students', id];

export function useStudents() {
  return useQuery({ queryKey: STUDENTS_QUERY_KEY, queryFn: () => api.get<Student[]>('/students') });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: studentQueryKey(id),
    queryFn: () => api.get<StudentDetail>(`/students/${id}`),
    enabled: !!id,
  });
}
