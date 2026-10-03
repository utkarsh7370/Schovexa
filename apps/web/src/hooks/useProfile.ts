import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface ProfileUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bio: string | null;
  status: string;
  lastLoginAt: string | null;
  /** Which non-essential messages this person wants. Security emails are always sent. */
  notifyByEmail: boolean;
  notifyInApp: boolean;
}

export interface TeacherDetail {
  id: string;
  employeeCode: string | null;
  joiningDate: string | null;
  assignments: {
    id: string;
    sectionId: string;
    subjectId: string;
    section: { id: string; name: string; class: { id: string; name: string } };
    subject: { id: string; name: string; code: string | null };
  }[];
  classTeacherOf: { id: string; name: string; class: { id: string; name: string } }[];
}

// One shape for "a person in this school" — the signed-in user's own
// profile, a staff member's, and a teacher's all come back like this.
export interface PersonProfile {
  membershipId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  joinedAt: string;
  role: { id: string; name: string };
  school: { id: string; name: string };
  user: ProfileUser;
  teacher: TeacherDetail | null;
  documentCount: number;
}

export interface PersonDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const MY_PROFILE_QUERY_KEY = ['me', 'profile'];
export const staffProfileQueryKey = (membershipId: string | undefined) => ['staff', membershipId];
export const teacherProfileQueryKey = (teacherId: string | undefined) => ['teacher-profile', teacherId];
export const personDocumentsQueryKey = (basePath: string) => ['person-documents', basePath];

export function useMyProfile() {
  return useQuery({ queryKey: MY_PROFILE_QUERY_KEY, queryFn: () => api.get<PersonProfile>('/me/profile') });
}

export function useStaffProfile(membershipId: string | undefined) {
  return useQuery({
    queryKey: staffProfileQueryKey(membershipId),
    queryFn: () => api.get<PersonProfile>(`/staff/${membershipId}`),
    enabled: !!membershipId,
  });
}

export function useTeacherProfile(teacherId: string | undefined) {
  return useQuery({
    queryKey: teacherProfileQueryKey(teacherId),
    queryFn: () => api.get<PersonProfile>(`/teachers/${teacherId}`),
    enabled: !!teacherId,
  });
}

export function usePersonDocuments(basePath: string, enabled = true) {
  return useQuery({
    queryKey: personDocumentsQueryKey(basePath),
    queryFn: () => api.get<PersonDocument[]>(basePath),
    enabled,
  });
}
