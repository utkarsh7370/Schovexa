import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface RosterEntry {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  attendanceId: string | null;
  status: AttendanceStatus | null;
  remarks: string | null;
}

export interface AttendanceSummaryRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  remarks: string | null;
}

export const rosterQueryKey = (sectionId: string | undefined, date: string | undefined) => [
  'attendance-roster',
  sectionId,
  date,
];

export function useAttendanceRoster(sectionId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: rosterQueryKey(sectionId, date),
    queryFn: () => api.get<RosterEntry[]>(`/attendance?sectionId=${sectionId}&date=${date}`),
    enabled: !!sectionId && !!date,
  });
}

export const summaryQueryKey = (sectionId: string | undefined, from: string, to: string) => [
  'attendance-summary',
  sectionId,
  from,
  to,
];

export function useAttendanceSummary(sectionId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: summaryQueryKey(sectionId, from, to),
    queryFn: () => api.get<AttendanceSummaryRow[]>(`/attendance/summary?sectionId=${sectionId}&from=${from}&to=${to}`),
    enabled: !!sectionId,
  });
}

export const historyQueryKey = (studentId: string | undefined, from: string, to: string) => [
  'attendance-history',
  studentId,
  from,
  to,
];

export function useAttendanceHistory(studentId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: historyQueryKey(studentId, from, to),
    queryFn: () => api.get<AttendanceRecord[]>(`/attendance/history?studentId=${studentId}&from=${from}&to=${to}`),
    enabled: !!studentId,
  });
}

// The school's own calendar date — the one day attendance can be marked
// or changed. Asked of the server because the browser's clock/zone can
// differ from the school's (a parent travelling, a teacher on a laptop
// set to another zone).
export const ATTENDANCE_TODAY_QUERY_KEY = ['attendance-today'];

export function useAttendanceToday() {
  return useQuery({
    queryKey: ATTENDANCE_TODAY_QUERY_KEY,
    queryFn: () => api.get<{ today: string }>('/attendance/today'),
    staleTime: 60_000,
  });
}
