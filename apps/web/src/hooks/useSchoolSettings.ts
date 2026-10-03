import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface SchoolSettings {
  schoolStartTime: string;
  schoolEndTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
  workingDays: number[];
  offSaturdays: number[];
  attendanceEditWindowDays: number;
  attendanceMinPercent: number;
  attendanceOnNonWorkingDays: boolean;
  receiptPrefix: string;
  allowPartialPayments: boolean;
  lateFeePerDayMinor: number;
  lateFeeGraceDays: number;
  /** The most an accountant can take off a fee without approval, as a percentage of the fee. */
  maxDiscountPercent: number;
  /** How long after recording a payment the accountant may still correct it. */
  paymentCorrectionWindowDays: number;
  /** Tell the family (in-app and email) when a payment is recorded. */
  notifyPaymentReceipt: boolean;
  passPercent: number;
  notifyAbsenceEmail: boolean;
  notifyYearApprovalEmail: boolean;
  notifyStaffAttendanceDecisions: boolean;
  documentMaxSizeMb: number;
  allowedDocumentTypes: string[];
  documentCategories: string[];
  requiredStudentDocuments: string[];
}

export interface GradeBand {
  label: string;
  minPercent: number;
  gradePoint: number | null;
  remark: string;
}

export interface Grading {
  passPercent: number;
  bands: GradeBand[];
  isDefault: boolean;
}

export const SCHOOL_SETTINGS_QUERY_KEY = ['school-settings'];
export const GRADING_QUERY_KEY = ['grading'];

export function useSchoolSettings() {
  return useQuery({ queryKey: SCHOOL_SETTINGS_QUERY_KEY, queryFn: () => api.get<SchoolSettings>('/school-settings'), retry: false });
}

export function useGrading() {
  return useQuery({ queryKey: GRADING_QUERY_KEY, queryFn: () => api.get<Grading>('/grading'), retry: false });
}
