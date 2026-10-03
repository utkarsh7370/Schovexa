import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { qs, type Paged } from './useFinance';

// Everything a teacher's screens read. Dates are YYYY-MM-DD (the school's calendar), times HH:mm.

export interface TeachingOptions {
  sections: { id: string; name: string; classId: string; className: string }[];
  subjects: { id: string; name: string }[];
  pairs: { sectionId: string; subjectId: string }[];
}

export interface Lesson {
  slotId: string;
  period: number;
  startTime: string;
  endTime: string;
  room: string | null;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  kind: 'OWN' | 'COVER' | 'COVERED';
  otherTeacher: string | null;
  reason: string | null;
}

export interface TeachingDashboard {
  today: string;
  isTeacher: boolean;
  schoolDay: { working: boolean; message: string };
  metrics: { myClasses: number; myStudents: number; todayClasses: number; attendancePending: number; homeworkPending: number; marksPending: number; assignmentsToReview: number; unreadMessages: number };
  lessons: Lesson[];
  nextLesson: Lesson | null;
  subjects: { section: { id: string; name: string }; subject: { id: string; name: string } }[];
  classTeacherOf: { id: string; name: string }[];
  attendancePending: { id: string; name: string }[];
  homeworkPending: { id: string; title: string; section: string; subject: string; dueDate: string; overdue: boolean }[];
  assignmentsToReview: { id: string; title: string; section: string; subject: string; dueDate: string; waiting: number }[];
  marksPending: { id: string; exam: string; subject: string; section: string; status: string; date: string | null }[];
  upcomingExams: { id: string; exam: string; subject: string; section: string; date: string | null; startTime: string | null; room: string | null }[];
  notices: { id: string; title: string; body: string; createdAt: string; isRead: boolean }[];
  upcomingEvents: { id: string; type: string; title: string; date: string; endDate: string; time: string | null }[];
  leave: { balances: LeaveBalance[]; pending: number; upcoming: { startDate: string; endDate: string; kind: string } | null };
  attendanceCorrections: Record<string, number>;
}

export interface AgendaItem {
  type: 'HOLIDAY' | 'EVENT' | 'MEETING' | 'PARENT_TEACHER' | 'EXAM' | 'HOMEWORK_DUE' | 'ASSIGNMENT_DUE' | 'LEAVE';
  title: string;
  subtitle: string | null;
  date: string;
  endDate: string;
  time: string | null;
  link: string;
}

export interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  period: number;
  startTime: string;
  endTime: string;
  room: string | null;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  teacher: { id: string; name: string };
}

export interface Substitution {
  id: string;
  date: string;
  reason: string | null;
  slot: TimetableSlot;
  substitute: { id: string; name: string };
}

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'REVIEWED' | 'RESUBMIT';

export interface CourseworkRow {
  id: string;
  kind: 'HOMEWORK' | 'ASSIGNMENT';
  title: string;
  description: string | null;
  dueDate: string;
  priority: Priority;
  maxMarks: number | null;
  status: 'ACTIVE' | 'CANCELLED' | 'ARCHIVED';
  wholeSection: boolean;
  studentCount: number;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  overdue?: boolean;
  files?: number;
  progress?: { students: number; submitted: number; toReview: number; reviewed: number; resubmit: number };
  children?: { studentId: string; name: string; status: SubmissionStatus; marks: number | null; feedback: string | null }[];
}

export interface FileInfo {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
export type CourseworkDetailFull = Omit<CourseworkRow, 'files' | 'progress' | 'children'> & {
  files: FileInfo[];
  roster: { studentId: string; name: string; admissionNo: string; rollNo: string | null; submissionId: string | null; status: SubmissionStatus; submittedAt: string | null; marks: number | null; feedback: string | null; files: number }[];
};

export interface ContentRow {
  id: string;
  kind: 'NOTE' | 'PDF' | 'VIDEO' | 'LINK' | 'WORKSHEET' | 'PRACTICE';
  title: string;
  description: string | null;
  url: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  mine: boolean;
  canEdit: boolean;
  files: number;
  fileList?: FileInfo[];
}

export type MarksStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'PUBLISHED' | 'CORRECTION';
export interface PaperRow {
  id: string;
  examId: string;
  examName: string;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  maxMarks: number;
  status: MarksStatus;
  returnNote: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
}
export interface ExamRow {
  id: string;
  name: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
  papers: PaperRow[];
}
export interface PaperDetail extends PaperRow {
  editable: boolean;
  passPercent: number;
  roster: { studentId: string; name: string; admissionNo: string; rollNo: string | null; marks: number | null; absent: boolean; remark: string | null }[];
  progress: { students: number; entered: number };
  corrections: { id: string; status: string; reason: string; decisionNote: string | null; createdAt: string }[];
}
export interface MarkCorrectionRow {
  id: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  requestedBy: string | null;
  requestedById: string;
  decidedBy: string | null;
  paper: { id: string; exam: string; subject: string; section: string; status: MarksStatus };
}

export interface ResultsView {
  student: { id: string; name: string; admissionNo: string };
  passPercent: number;
  exams: { examId: string; name: string; startDate: string; totalMarks: number; totalMax: number; percent: number | null; subjects: { subject: string; marks: number | null; absent: boolean; maxMarks: number; percent: number | null; grade: string | null; passed: boolean | null; remark: string | null }[] }[];
}

export type RemarkKind = 'ACADEMIC' | 'BEHAVIOUR' | 'STRENGTH' | 'WEAK_AREA' | 'PARTICIPATION' | 'HOMEWORK' | 'OBSERVATION' | 'RECOMMENDATION';
export interface RemarkRow {
  id: string;
  kind: RemarkKind;
  body: string;
  subject: string | null;
  visibleToParents: boolean;
  author: string | null;
  mine: boolean;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  threadId: string;
  kind: string;
  subject: string;
  preview: string;
  sender: string | null;
  mine: boolean;
  student: string | null;
  unread: boolean;
  createdAt: string;
}
export interface MessageThread {
  threadId: string;
  subject: string;
  messages: { id: string; kind: string; sender: string | null; mine: boolean; body: string; createdAt: string }[];
}

export interface LeaveBalance {
  kind: 'CASUAL' | 'SICK' | 'EARNED';
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
}
export interface LeaveRow {
  id: string;
  kind: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  applicant: string | null;
  userId: string;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  files: number;
}

export interface AttendanceCorrectionRow {
  id: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  date: string;
  fromStatus: string | null;
  toStatus: string;
  remarks: string | null;
  reason: string;
  createdAt: string;
  requestedBy: string | null;
  requestedById: string;
  decidedBy: string | null;
  decisionNote: string | null;
  student: { id: string; name: string; admissionNo: string };
  section: { id: string; name: string };
}

export interface SchoolEventRow {
  id: string;
  kind: 'EVENT' | 'MEETING' | 'PARENT_TEACHER';
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
}

export interface TeachingReport {
  title: string;
  columns: { key: string; header: string; type: 'text' | 'money' | 'number' | 'date' | 'percent' }[];
  rows: Record<string, string | number | null>[];
  totals: { label: string; value: number; type: 'money' | 'number' | 'percent' }[];
  note: string | null;
  generatedAt: string;
}

export const teachingKeys = { all: ['teaching'] as const };

const q = <T>(key: unknown[], path: string, enabled = true, extra: { refetchInterval?: number } = {}) => ({ queryKey: ['teaching', ...key], queryFn: () => api.get<T>(path), enabled, ...extra });

export const useTeachingOptions = (enabled = true) => useQuery({ ...q<TeachingOptions>(['options'], '/teaching/options', enabled), staleTime: 5 * 60_000 });
export const useTeachingDashboard = () => useQuery(q<TeachingDashboard>(['dashboard'], '/teaching/dashboard', true, { refetchInterval: 120_000 }));
export const useAgenda = (from: string, to: string, enabled = true) => useQuery(q<AgendaItem[]>(['agenda', from, to], `/teaching/agenda${qs({ from, to })}`, enabled));
export const useTodaySchedule = (date?: string) => useQuery(q<{ date: string; lessons: Lesson[] }>(['today', date ?? 'today'], `/timetable/today${qs({ date })}`));
export const useTimetable = (f: { sectionId?: string; mine?: boolean }) => useQuery(q<TimetableSlot[]>(['timetable', f], `/timetable${qs({ sectionId: f.sectionId, mine: f.mine ? '1' : undefined })}`));
export const useSubstitutions = (from: string, to: string, enabled = true) => useQuery(q<Substitution[]>(['substitutions', from, to], `/timetable/substitutions${qs({ from, to })}`, enabled));

export function useCoursework(kind: 'HOMEWORK' | 'ASSIGNMENT', f: { sectionId?: string; subjectId?: string; status?: string; when?: string; search?: string; page?: number; pageSize?: number }) {
  const base = kind === 'HOMEWORK' ? '/homework' : '/assignments';
  return useQuery({ ...q<Paged<CourseworkRow>>(['coursework', kind, f], `${base}${qs({ ...f })}`), placeholderData: (prev) => prev });
}
export function useCourseworkDetail(kind: 'HOMEWORK' | 'ASSIGNMENT', id: string | undefined) {
  const base = kind === 'HOMEWORK' ? '/homework' : '/assignments';
  return useQuery(q<CourseworkDetailFull>(['coursework-detail', kind, id], `${base}/${id}`, !!id));
}
export function useContent(f: { sectionId?: string; subjectId?: string; kind?: string; status?: string; search?: string; page?: number }) {
  return useQuery({ ...q<Paged<ContentRow>>(['content', f], `/content${qs({ ...f, pageSize: 24 })}`), placeholderData: (prev) => prev });
}
export const useExams = (enabled = true) => useQuery(q<ExamRow[]>(['exams'], '/exams', enabled));
export const useMyPapers = (enabled = true) => useQuery(q<PaperRow[]>(['papers', 'mine'], '/exams/papers/mine', enabled));
export const usePaperQueue = (status?: string, enabled = true) => useQuery(q<PaperRow[]>(['papers', 'queue', status], `/exams/papers/queue${qs({ status })}`, enabled));
export const usePaper = (id: string | undefined) => useQuery(q<PaperDetail>(['paper', id], `/exams/papers/${id}`, !!id));
export const useMarkCorrections = (status?: string, enabled = true) => useQuery(q<MarkCorrectionRow[]>(['mark-corrections', status], `/exams/corrections${qs({ status })}`, enabled));
export const useResults = (studentId: string | undefined, enabled = true) => useQuery(q<ResultsView>(['results', studentId], `/results/students/${studentId}`, !!studentId && enabled));
export const useRemarks = (studentId: string | undefined, enabled = true) => useQuery(q<RemarkRow[]>(['remarks', studentId], `/remarks${qs({ studentId })}`, !!studentId && enabled));
export const useMessages = (box: 'inbox' | 'sent', page: number) => useQuery({ ...q<Paged<MessageRow>>(['messages', box, page], `/messages${qs({ box, page })}`), placeholderData: (prev) => prev });
export const useMessageThread = (id: string | undefined) => useQuery(q<MessageThread>(['thread', id], `/messages/${id}`, !!id));
export const useUnreadMessages = () => useQuery({ ...q<{ unread: number }>(['unread-messages'], '/messages/unread-count'), refetchInterval: 90_000 });
export const useMyLeave = () => useQuery(q<{ balances: LeaveBalance[]; requests: LeaveRow[] }>(['leave', 'mine'], '/leave/mine'));
export const useAllLeave = (status: string, page: number, enabled = true) => useQuery({ ...q<Paged<LeaveRow> & { counts: Record<string, number> }>(['leave', 'all', status, page], `/leave${qs({ status, page })}`, enabled), placeholderData: (prev) => prev });
export const useAttendanceCorrections = (status?: string) => useQuery(q<{ data: AttendanceCorrectionRow[]; total: number }>(['attendance-corrections', status], `/attendance/corrections${qs({ status })}`));
export const useEvents = (from?: string, to?: string, enabled = true) => useQuery(q<SchoolEventRow[]>(['events', from, to], `/events${qs({ from, to })}`, enabled));
export const useTeachingReport = (kind: string, f: { from?: string; to?: string; sectionId?: string; subjectId?: string; examId?: string }) => useQuery(q<TeachingReport>(['report', kind, f], `/teaching/reports/${kind}${qs({ ...f })}`));

export interface PlanningOptions {
  sections: { id: string; name: string; classId: string; className: string }[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  assignments: { sectionId: string; subjectId: string; teacherId: string }[];
  academicYears: { id: string; name: string; isCurrent: boolean }[];
}
/** The whole school's classes, subjects and teachers — for the people who build the timetable and exam papers. */
export const usePlanningOptions = (from: 'timetable' | 'exams', enabled = true) => useQuery({ ...q<PlanningOptions>(['planning', from], `/${from}/options`, enabled), staleTime: 5 * 60_000 });
