import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  userId: string | null;
}

export const PARENTS_QUERY_KEY = ['parents'];

export function useParents() {
  return useQuery({ queryKey: PARENTS_QUERY_KEY, queryFn: () => api.get<Parent[]>('/parents') });
}
