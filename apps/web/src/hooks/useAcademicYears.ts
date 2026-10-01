import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type AcademicYearStatus = 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED' | 'EXPIRED';
export type AcademicYearReviewAction = 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'EXPIRED';

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: AcademicYearStatus;
  createdBy: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AcademicYearReview {
  id: string;
  action: AcademicYearReviewAction;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export interface AcademicYearAttention {
  awaitingApproval: AcademicYear[];
  needsRevision: AcademicYear[];
}

export const ACADEMIC_YEARS_QUERY_KEY = ['academic-years'];
export const ACADEMIC_YEAR_ATTENTION_QUERY_KEY = ['academic-years', 'attention'];
export const academicYearReviewsQueryKey = (id: string) => ['academic-years', id, 'reviews'];

export function useAcademicYears() {
  return useQuery({
    queryKey: ACADEMIC_YEARS_QUERY_KEY,
    queryFn: () => api.get<AcademicYear[]>('/academic-years'),
  });
}

export function useAcademicYearReviews(id: string, enabled: boolean) {
  return useQuery({
    queryKey: academicYearReviewsQueryKey(id),
    queryFn: () => api.get<AcademicYearReview[]>(`/academic-years/${id}/reviews`),
    enabled,
  });
}

/** What needs the signed-in person's attention — a proposal to decide, or one sent back. */
export function useAcademicYearAttention(enabled: boolean) {
  return useQuery({
    queryKey: ACADEMIC_YEAR_ATTENTION_QUERY_KEY,
    queryFn: () => api.get<AcademicYearAttention>('/academic-years/attention'),
    enabled,
  });
}
