import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  headTeacher: { id: string; name: string } | null;
  teacherCount: number;
  subjectCount: number;
}

export interface DepartmentDetail extends Department {
  teachers: { id: string; name: string; email: string }[];
  subjects: { id: string; name: string; code: string | null }[];
}

export const DEPARTMENTS_QUERY_KEY = ['departments'];
export const departmentQueryKey = (id: string | undefined) => ['departments', id];

export function useDepartments(enabled = true) {
  return useQuery({ queryKey: DEPARTMENTS_QUERY_KEY, queryFn: () => api.get<Department[]>('/departments'), enabled });
}

export function useDepartment(id: string | undefined) {
  return useQuery({ queryKey: departmentQueryKey(id), queryFn: () => api.get<DepartmentDetail>(`/departments/${id}`), enabled: !!id });
}
