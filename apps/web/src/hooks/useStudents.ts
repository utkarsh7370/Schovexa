import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { SchoolDay } from '../lib/school-day';

export type StudentStatus = 'ENROLLED' | 'TRANSFERRED' | 'GRADUATED' | 'WITHDRAWN';

export interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  sectionId: string | null;
  /** Where to fetch the photo through the signed-in session; null when there is none. */
  photoUrl: string | null;
  status: StudentStatus;
  schoolDay: SchoolDay;
}

// Row shape of the paginated list: the base student plus their section,
// class and class teacher so a card can render without follow-up calls.
export interface StudentListItem extends Student {
  section: {
    id: string;
    name: string;
    class: { id: string; name: string };
    classTeacher: { id: string; user: { firstName: string; lastName: string } } | null;
  } | null;
}

export interface StudentListParams {
  page: number;
  pageSize: number;
  search?: string;
  classId?: string;
  sectionId?: string;
  classTeacherId?: string;
  status?: string;
  schoolDay?: string;
}

export interface StudentPage {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StudentParentLink {
  id: string;
  relation: string;
  isPrimary: boolean;
  parent: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
}

export interface StudentDetail extends Student {
  section: {
    id: string;
    name: string;
    class: { id: string; name: string };
    classTeacher: { id: string; user: { firstName: string; lastName: string } } | null;
  } | null;
  parents: StudentParentLink[];
}

export const STUDENTS_QUERY_KEY = ['students'];
export const studentQueryKey = (id: string | undefined) => ['students', id];

export function useStudents(options?: { enabled?: boolean }) {
  return useQuery({ queryKey: STUDENTS_QUERY_KEY, queryFn: () => api.get<Student[]>('/students'), enabled: options?.enabled });
}

export function useStudentsPage(params: StudentListParams) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  return useQuery({
    // Nested under STUDENTS_QUERY_KEY so the existing
    // invalidateQueries({ queryKey: STUDENTS_QUERY_KEY }) after an
    // admission also refreshes whichever page is on screen.
    queryKey: [...STUDENTS_QUERY_KEY, 'page', params],
    queryFn: () => api.get<StudentPage>(`/students?${qs.toString()}`),
    // Keep the old rows on screen while the next page/filter loads —
    // no flash of skeletons on every keystroke or page click.
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: studentQueryKey(id),
    queryFn: () => api.get<StudentDetail>(`/students/${id}`),
    enabled: !!id,
  });
}
