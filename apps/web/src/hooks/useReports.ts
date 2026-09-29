import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StudentReportRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  status: string;
  gender: string | null;
  className: string | null;
  sectionName: string | null;
}

export interface AttendanceReportRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string | null;
  sectionName: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  totalMarked: number;
  attendancePercent: number | null;
}

export interface FeeReportRow {
  studentFeeId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  feeCategory: string;
  amountDueMinor: number;
  paidMinor: number;
  balanceMinor: number;
  status: string;
  dueDate: string | null;
}

export interface FeeReportTotals {
  assignedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
}

interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function useStudentReport(filters: { classId?: string; sectionId?: string; status?: string }, page: number) {
  const query = buildQuery({ ...filters, page, pageSize: 20 });
  return useQuery({
    queryKey: ['reports-students', filters, page],
    queryFn: () => api.get<Paginated<StudentReportRow>>(`/reports/students${query}`),
  });
}

export function useAttendanceReport(
  filters: { classId?: string; sectionId?: string; from: string; to: string },
  page: number,
) {
  const query = buildQuery({ ...filters, page, pageSize: 20 });
  return useQuery({
    queryKey: ['reports-attendance', filters, page],
    queryFn: () => api.get<Paginated<AttendanceReportRow>>(`/reports/attendance${query}`),
    enabled: !!filters.from && !!filters.to,
  });
}

export function useFeeReport(filters: { academicYearId?: string }, page: number) {
  const query = buildQuery({ ...filters, page, pageSize: 20 });
  return useQuery({
    queryKey: ['reports-fees', filters, page],
    queryFn: () => api.get<Paginated<FeeReportRow> & { totals: FeeReportTotals }>(`/reports/fees${query}`),
  });
}
