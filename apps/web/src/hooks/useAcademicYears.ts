import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export const ACADEMIC_YEARS_QUERY_KEY = ['academic-years'];

export function useAcademicYears() {
  return useQuery({
    queryKey: ACADEMIC_YEARS_QUERY_KEY,
    queryFn: () => api.get<AcademicYear[]>('/academic-years'),
  });
}
