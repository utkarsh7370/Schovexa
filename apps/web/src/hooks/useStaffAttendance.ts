import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type StaffAttendanceApproval = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StaffAttendanceRecord {
  id: string;
  date: string;
  punchInAt: string;
  punchOutAt: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  source: 'SELF' | 'BIOMETRIC';
  approval: StaffAttendanceApproval;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface StaffSchedule {
  punchIn: string;
  punchOut: string;
  graceMinutes: number;
}

export interface StaffAttendanceToday {
  date: string;
  schedule: StaffSchedule;
  holiday: { id: string; name: string } | null;
  record: StaffAttendanceRecord | null;
}

export interface MyStaffAttendance {
  month: string;
  schedule: StaffSchedule;
  summary: { daysPresent: number; daysLate: number; pendingApproval: number; rejected: number };
  records: StaffAttendanceRecord[];
}

export interface StaffRosterRow {
  userId: string;
  name: string;
  email: string;
  roleName: string;
  record: StaffAttendanceRecord | null;
}

export interface StaffRoster {
  date: string;
  isToday: boolean;
  holiday: { id: string; name: string } | null;
  schedule: StaffSchedule;
  summary: { expected: number; present: number; late: number; notMarked: number; pendingApproval: number };
  rows: StaffRosterRow[];
}

export interface StaffAttendancePending {
  count: number;
  people: number;
  oldestDate: string | null;
}

export const STAFF_ATTENDANCE_TODAY_KEY = ['staff-attendance', 'today'];
export const STAFF_ATTENDANCE_MINE_KEY = ['staff-attendance', 'mine'];
export const STAFF_ATTENDANCE_ROSTER_KEY = ['staff-attendance', 'roster'];
export const STAFF_ATTENDANCE_PENDING_KEY = ['staff-attendance', 'pending'];

export function useStaffAttendanceToday(enabled = true) {
  return useQuery({
    queryKey: STAFF_ATTENDANCE_TODAY_KEY,
    queryFn: () => api.get<StaffAttendanceToday>('/staff-attendance/today'),
    enabled,
  });
}

export function useMyStaffAttendance(month: string | undefined) {
  return useQuery({
    queryKey: [...STAFF_ATTENDANCE_MINE_KEY, month ?? 'current'],
    queryFn: () => api.get<MyStaffAttendance>(`/staff-attendance/mine${month ? `?month=${month}` : ''}`),
  });
}

export function useStaffRoster(date: string | undefined) {
  return useQuery({
    queryKey: [...STAFF_ATTENDANCE_ROSTER_KEY, date ?? 'today'],
    queryFn: () => api.get<StaffRoster>(`/staff-attendance/roster${date ? `?date=${date}` : ''}`),
  });
}

export function useStaffAttendancePending(enabled: boolean) {
  return useQuery({
    queryKey: STAFF_ATTENDANCE_PENDING_KEY,
    queryFn: () => api.get<StaffAttendancePending>('/staff-attendance/pending'),
    enabled,
  });
}
