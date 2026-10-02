import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface School {
  id: string;
  name: string;
  logoUrl: string | null;
  hasLogo: boolean;
  motto: string | null;
  description: string | null;
  schoolCode: string | null;
  board: string | null;
  schoolType: string | null;
  establishedYear: number | null;
  affiliationNo: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  alternatePhone: string | null;
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
  updatedAt: string;
}

export const CURRENT_SCHOOL_QUERY_KEY = ['schools', 'me'];

export function useCurrentSchool() {
  return useQuery({
    queryKey: CURRENT_SCHOOL_QUERY_KEY,
    queryFn: () => api.get<School>('/schools/me'),
    retry: false,
  });
}
