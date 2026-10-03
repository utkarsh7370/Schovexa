import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

// Everything the accountant's screens read. Money is always in minor units (paise).

export type PaymentMethodValue = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'ONLINE';

export interface FinanceConfig {
  paymentMethods: { value: PaymentMethodValue; label: string }[];
  onlinePaymentsEnabled: boolean;
  allowPartialPayments: boolean;
  maxDiscountPercent: number;
  paymentCorrectionWindowDays: number;
  receiptPrefix: string;
}

export interface FinanceDashboard {
  today: string;
  collection: {
    todayMinor: number;
    todayCount: number;
    monthMinor: number;
    totalMinor: number;
    refundedMinor: number;
    todayByMethod: { method: string; label: string; amountMinor: number; count: number }[];
  };
  outstanding: { totalMinor: number; fees: number };
  overdue: { totalMinor: number; fees: number };
  pendingPayments: { pending: number; partiallyPaid: number };
  refunds: { requested: number; requestedMinor: number; approvedToPayOut: number; approvedMinor: number };
  pendingConcessions: number;
  paymentFailures: { enabled: boolean; message: string };
  recentTransactions: {
    id: string;
    receiptId: string | null;
    receiptNo: string | null;
    paidAt: string;
    amountMinor: number;
    method: string;
    collectedBy: string | null;
    studentId: string;
    studentName: string;
    feeCategory: string;
  }[];
  trend: { date: string; amountMinor: number }[];
}

export interface FinanceStudentHit {
  id: string;
  admissionNo: string;
  name: string;
  photoUrl: string | null;
  className: string | null;
  sectionName: string | null;
  status: string;
  balanceMinor: number;
  overdueMinor: number;
}

export interface FinanceFeeRow {
  id: string;
  feeCategory: string;
  frequency: string;
  amountDueMinor: number;
  discountMinor: number;
  netDueMinor: number;
  paidMinor: number;
  refundedMinor: number;
  balanceMinor: number;
  dueDate: string | null;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'WAIVED';
  overdue: boolean;
  daysLate: number;
  lateFeeMinor: number;
}

export interface FinanceStudent {
  id: string;
  admissionNo: string;
  name: string;
  photoUrl: string | null;
  status: string;
  className: string | null;
  sectionName: string | null;
  parents: { id: string; name: string; relation: string; isPrimary: boolean; phone: string | null; email: string | null }[];
  summary: { netDueMinor: number; paidMinor: number; balanceMinor: number; overdueMinor: number; discountMinor: number };
  fees: FinanceFeeRow[];
}

export interface TransactionRow {
  id: string;
  receiptId: string | null;
  receiptNo: string | null;
  paidAt: string;
  amountMinor: number;
  method: PaymentMethodValue;
  methodLabel: string;
  reference: string | null;
  receivedFrom: string | null;
  note: string | null;
  collectedBy: string | null;
  corrected: boolean;
  correctionReason: string | null;
  refundedMinor: number;
  refundableMinor: number;
  hasOpenRefund: boolean;
  studentFeeId: string;
  feeCategory: string;
  student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null };
}

export interface Paged<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface TransactionsPage extends Paged<TransactionRow> {
  totalMinor: number;
}

export interface TransactionFilters {
  search?: string;
  from?: string;
  to?: string;
  method?: string;
  classId?: string;
  sectionId?: string;
  studentId?: string;
  page?: number;
  pageSize?: number;
}

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
export interface RefundRow {
  id: string;
  status: RefundStatus;
  amountMinor: number;
  reason: string;
  method: string;
  createdAt: string;
  requestedBy: string | null;
  requestedById: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  processedBy: string | null;
  processedAt: string | null;
  payment: { id: string; receiptNo: string | null; receiptId: string | null; amountMinor: number; paidAt: string };
  feeCategory: string;
  student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null };
}
export interface RefundsPage extends Paged<RefundRow> {
  counts: Record<RefundStatus, number>;
}

export type ConcessionKind = 'DISCOUNT' | 'SCHOLARSHIP' | 'CONCESSION';
export type ConcessionStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'APPLIED';
export interface ConcessionRow {
  id: string;
  kind: ConcessionKind;
  name: string;
  status: ConcessionStatus;
  amountMinor: number;
  reason: string;
  createdAt: string;
  requestedBy: string | null;
  requestedById: string;
  decidedBy: string | null;
  decisionNote: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  studentFeeId: string;
  feeCategory: string;
  feeAmountMinor: number;
  student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null };
}
export interface ConcessionsPage extends Paged<ConcessionRow> {
  counts: Record<ConcessionStatus, number>;
  maxDiscountPercent: number;
}

export interface LedgerEntry {
  at: string;
  type: 'CHARGE' | 'DISCOUNT' | 'PAYMENT' | 'REFUND' | 'WAIVER';
  description: string;
  reference: string | null;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}
export interface Ledger {
  student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null };
  entries: LedgerEntry[];
  totals: { billedMinor: number; discountsMinor: number; paidMinor: number; refundedMinor: number; balanceMinor: number };
}

export interface DemandRow {
  studentId: string;
  admissionNo: string;
  name: string;
  className: string | null;
  sectionName: string | null;
  parentName: string | null;
  parentPhone: string | null;
  totalMinor: number;
  overdueMinor: number;
  fees: { id: string; feeCategory: string; dueDate: string | null; netDueMinor: number; paidMinor: number; balanceMinor: number; overdue: boolean }[];
}
export interface Demand {
  asOf: string;
  data: DemandRow[];
  totals: { students: number; totalMinor: number; overdueMinor: number };
}

export interface ReminderLogRow {
  id: string;
  createdAt: string;
  kind: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  detail: string | null;
  studentName: string;
  admissionNo: string;
  feeCategory: string;
}

export interface ReportColumn {
  key: string;
  header: string;
  type: 'text' | 'money' | 'number' | 'date';
}
export interface FinanceReport {
  kind: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: { label: string; value: number; type: 'money' | 'number' }[];
  note: string | null;
  generatedAt: string;
}

export interface FinanceAuditRow {
  id: string;
  createdAt: string;
  action: string;
  module: string;
  resourceType: string;
  resourceId: string;
  actor: { id: string; name: string } | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ReceiptView {
  id: string;
  receiptNo: string;
  issuedAt: string;
  reprintCount: number;
  lastPrintedAt: string | null;
  paymentId: string;
  school: { name: string; address: string | null; phone: string | null; email: string | null; hasLogo: boolean };
  student: { id: string; name: string; admissionNo: string; className: string | null; sectionName: string | null; parentName: string | null };
  fee: { category: string; amountDueMinor: number; discountMinor: number; netDueMinor: number };
  payment: {
    amountMinor: number;
    method: string;
    methodLabel: string;
    paidAt: string;
    reference: string | null;
    receivedFrom: string | null;
    note: string | null;
    collectedBy: string | null;
    corrected: boolean;
  };
  balanceMinor: number;
  refundedMinor: number;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const financeKeys = {
  all: ['finance'] as const,
  config: ['finance', 'config'] as const,
  dashboard: ['finance', 'dashboard'] as const,
};

export function useFinanceConfig() {
  return useQuery({ queryKey: financeKeys.config, queryFn: () => api.get<FinanceConfig>('/finance/config'), staleTime: 5 * 60_000 });
}

export function useFinanceDashboard() {
  return useQuery({ queryKey: financeKeys.dashboard, queryFn: () => api.get<FinanceDashboard>('/finance/dashboard'), refetchInterval: 60_000 });
}

export function useFinanceStudentSearch(search: string) {
  return useQuery({
    queryKey: ['finance', 'student-search', search],
    queryFn: () => api.get<{ data: FinanceStudentHit[] }>(`/finance/students${qs({ search })}`),
    enabled: search.trim().length > 0,
    placeholderData: (prev) => prev,
  });
}

export function useFinanceStudent(id: string | undefined) {
  return useQuery({ queryKey: ['finance', 'student', id], queryFn: () => api.get<FinanceStudent>(`/finance/students/${id}`), enabled: !!id });
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['finance', 'transactions', filters],
    queryFn: () => api.get<TransactionsPage>(`/payments${qs({ ...filters })}`),
    placeholderData: (prev) => prev,
  });
}

export function useRefunds(filters: { status?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['finance', 'refunds', filters],
    queryFn: () => api.get<RefundsPage>(`/refunds${qs({ ...filters })}`),
    placeholderData: (prev) => prev,
  });
}

export function useConcessions(filters: { status?: string; kind?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['finance', 'concessions', filters],
    queryFn: () => api.get<ConcessionsPage>(`/concessions${qs({ ...filters })}`),
    placeholderData: (prev) => prev,
  });
}

export function useLedger(studentId: string | undefined) {
  return useQuery({ queryKey: ['finance', 'ledger', studentId], queryFn: () => api.get<Ledger>(`/students/${studentId}/ledger`), enabled: !!studentId });
}

export function useDemand(filters: { classId?: string; sectionId?: string; academicYearId?: string }) {
  return useQuery({ queryKey: ['finance', 'demand', filters], queryFn: () => api.get<Demand>(`/finance/demand${qs({ ...filters })}`) });
}

export function useReminderLog(page: number) {
  return useQuery({
    queryKey: ['finance', 'reminder-log', page],
    queryFn: () => api.get<{ data: ReminderLogRow[]; total: number; page: number; pageSize: number }>(`/finance/reminders${qs({ page })}`),
    placeholderData: (prev) => prev,
  });
}

export function useFinanceReport(kind: string, filters: { from?: string; to?: string; classId?: string; sectionId?: string; method?: string }) {
  return useQuery({
    queryKey: ['finance', 'report', kind, filters],
    queryFn: () => api.get<FinanceReport>(`/finance/reports/${kind}${qs({ ...filters })}`),
  });
}

export function useFinanceAudit(filters: { module?: string; action?: string; from?: string; to?: string; q?: string; page?: number }) {
  return useQuery({
    queryKey: ['finance', 'audit', filters],
    queryFn: () => api.get<Paged<FinanceAuditRow> & { modules: string[] }>(`/finance/audit${qs({ ...filters })}`),
    placeholderData: (prev) => prev,
  });
}

export function useReceipt(id: string | undefined) {
  return useQuery({ queryKey: ['finance', 'receipt', id], queryFn: () => api.get<ReceiptView>(`/receipts/${id}`), enabled: !!id });
}

export interface FinanceClass {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

export function useFinanceClasses() {
  return useQuery({ queryKey: ['finance', 'classes'], queryFn: () => api.get<FinanceClass[]>('/finance/classes'), staleTime: 5 * 60_000 });
}
