import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface School {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  timezone: string;
  country: string;
  currency: string;
  dateFormat: string;
  staffPunchInTime: string;
  staffPunchOutTime: string;
  staffLateGraceMinutes: number;
  notifyParentsOnAbsence: boolean;
}

export const CURRENT_SCHOOL_QUERY_KEY = ['schools', 'me'];

export function useCurrentSchool() {
  return useQuery({
    queryKey: CURRENT_SCHOOL_QUERY_KEY,
    queryFn: () => api.get<School>('/schools/me'),
    retry: false,
  });
}
