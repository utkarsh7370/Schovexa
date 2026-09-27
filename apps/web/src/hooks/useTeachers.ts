import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Teacher {
  id: string;
  employeeCode: string | null;
  joiningDate: string | null;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export interface TeacherAssignment {
  id: string;
  sectionId: string;
  subjectId: string;
  section: { id: string; name: string; class: { id: string; name: string } };
  subject: { id: string; name: string; code: string | null };
}

export const TEACHERS_QUERY_KEY = ['teachers'];
export const teacherAssignmentsQueryKey = (teacherId: string | undefined) => ['teacher-assignments', teacherId];

export function useTeachers() {
  return useQuery({ queryKey: TEACHERS_QUERY_KEY, queryFn: () => api.get<Teacher[]>('/teachers') });
}

export function useTeacherAssignments(teacherId: string | undefined) {
  return useQuery({
    queryKey: teacherAssignmentsQueryKey(teacherId),
    queryFn: () => api.get<TeacherAssignment[]>(`/teachers/${teacherId}/assignments`),
    enabled: !!teacherId,
  });
}
