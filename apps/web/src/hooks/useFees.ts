import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface FeeCategory {
  id: string;
  name: string;
}

export interface FeeStructure {
  id: string;
  amountMinor: number;
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  feeCategory: { id: string; name: string };
  class: { id: string; name: string } | null;
}

export type StudentFeeStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'WAIVED';

export interface StudentFee {
  id: string;
  studentId: string;
  feeStructureId: string;
  amountDueMinor: number;
  dueDate: string | null;
  status: StudentFeeStatus;
  paidMinor: number;
  balanceMinor: number;
  feeCategory: { id: string; name: string };
  frequency: string;
}

export interface OutstandingRow extends StudentFee {
  student: { id: string; admissionNo: string; firstName: string; lastName: string };
}

export interface Payment {
  id: string;
  amountMinor: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'ONLINE';
  paidAt: string;
  receipt: { receiptNo: string } | null;
}

export const FEE_CATEGORIES_QUERY_KEY = ['fee-categories'];
export const feeStructuresQueryKey = (academicYearId?: string) => ['fee-structures', academicYearId ?? 'all'];
export const studentFeesQueryKey = (studentId: string | undefined) => ['student-fees', studentId];
export const OUTSTANDING_QUERY_KEY = ['fees-outstanding'];
export const paymentsQueryKey = (studentFeeId: string | undefined) => ['fee-payments', studentFeeId];

export function useFeeCategories() {
  return useQuery({ queryKey: FEE_CATEGORIES_QUERY_KEY, queryFn: () => api.get<FeeCategory[]>('/fee-categories') });
}

export function useFeeStructures(academicYearId?: string) {
  return useQuery({
    queryKey: feeStructuresQueryKey(academicYearId),
    queryFn: () =>
      api.get<FeeStructure[]>(academicYearId ? `/fee-structures?academicYearId=${academicYearId}` : '/fee-structures'),
  });
}

export function useStudentFees(studentId: string | undefined) {
  return useQuery({
    queryKey: studentFeesQueryKey(studentId),
    queryFn: () => api.get<StudentFee[]>(`/students/${studentId}/fees`),
    enabled: !!studentId,
  });
}

export function useOutstandingFees() {
  return useQuery({ queryKey: OUTSTANDING_QUERY_KEY, queryFn: () => api.get<OutstandingRow[]>('/fees/outstanding') });
}

export function useFeePayments(studentFeeId: string | undefined) {
  return useQuery({
    queryKey: paymentsQueryKey(studentFeeId),
    queryFn: () => api.get<Payment[]>(`/student-fees/${studentFeeId}/payments`),
    enabled: !!studentFeeId,
  });
}
