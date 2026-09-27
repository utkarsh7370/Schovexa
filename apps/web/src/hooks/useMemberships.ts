import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Membership {
  membershipId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  user: { id: string; email: string; firstName: string; lastName: string; status: string };
  role: { id: string; name: string };
}

export const MEMBERSHIPS_QUERY_KEY = ['memberships'];

export function useMemberships() {
  return useQuery({ queryKey: MEMBERSHIPS_QUERY_KEY, queryFn: () => api.get<Membership[]>('/memberships') });
}
