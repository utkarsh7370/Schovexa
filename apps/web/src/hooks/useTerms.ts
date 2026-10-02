import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface AcademicTerm {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export const termsQueryKey = (yearId: string) => ['academic-years', yearId, 'terms'];

export function useTerms(yearId: string, enabled = true) {
  return useQuery({ queryKey: termsQueryKey(yearId), queryFn: () => api.get<AcademicTerm[]>(`/academic-years/${yearId}/terms`), enabled });
}
