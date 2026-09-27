import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface SchoolClass {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  order: number;
}

export const classesQueryKey = (academicYearId?: string) => ['classes', academicYearId ?? 'all'];

export function useClasses(academicYearId?: string) {
  return useQuery({
    queryKey: classesQueryKey(academicYearId),
    queryFn: () =>
      api.get<SchoolClass[]>(academicYearId ? `/classes?academicYearId=${academicYearId}` : '/classes'),
  });
}
