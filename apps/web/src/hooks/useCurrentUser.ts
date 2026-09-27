import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { CurrentUser } from '@schovexa/types';

export const CURRENT_USER_QUERY_KEY = ['auth', 'me'];

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: () => api.get<CurrentUser>('/auth/me'),
  });
}
