import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface ParentChild {
  id: string;
  relation: string;
  isPrimary: boolean;
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    status: 'ENROLLED' | 'TRANSFERRED' | 'GRADUATED' | 'WITHDRAWN';
    section: { id: string; name: string; class: { id: string; name: string } } | null;
  };
}

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  userId: string | null;
  children: ParentChild[];
}

export const PARENTS_QUERY_KEY = ['parents'];
export const parentQueryKey = (id: string | undefined) => ['parents', id];

export function useParents(options?: { enabled?: boolean }) {
  return useQuery({ queryKey: PARENTS_QUERY_KEY, queryFn: () => api.get<Parent[]>('/parents'), enabled: options?.enabled });
}

export function useParent(id: string | undefined) {
  return useQuery({
    queryKey: parentQueryKey(id),
    queryFn: () => api.get<Parent>(`/parents/${id}`),
    enabled: !!id,
  });
}
