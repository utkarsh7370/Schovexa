import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type GroupKind = 'HOUSE' | 'CLUB' | 'SPORTS' | 'OTHER';

export const GROUP_KIND_LABELS: Record<GroupKind, string> = { HOUSE: 'House', CLUB: 'Club', SPORTS: 'Sports team', OTHER: 'Group' };

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  color: string;
  motto: string | null;
  description: string | null;
  leader: { id: string; name: string } | null;
  memberCount: number;
}

export interface GroupDetail extends Group {
  members: { studentId: string; admissionNo: string; name: string; className: string | null }[];
}

export interface StudentGroupBadge {
  id: string;
  name: string;
  kind: GroupKind;
  color: string;
}

export const GROUPS_QUERY_KEY = ['groups'];
export const groupQueryKey = (id: string | undefined) => ['groups', id];
export const studentGroupsQueryKey = (studentId: string | undefined) => ['groups', 'student', studentId];

export function useGroups(enabled = true) {
  return useQuery({ queryKey: GROUPS_QUERY_KEY, queryFn: () => api.get<Group[]>('/groups'), enabled });
}

export function useGroup(id: string | undefined) {
  return useQuery({ queryKey: groupQueryKey(id), queryFn: () => api.get<GroupDetail>(`/groups/${id}`), enabled: !!id });
}

export function useStudentGroups(studentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: studentGroupsQueryKey(studentId),
    queryFn: () => api.get<StudentGroupBadge[]>(`/groups/student/${studentId}`),
    enabled: !!studentId && enabled,
  });
}
