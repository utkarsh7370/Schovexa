import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface DeviceSession {
  id: string;
  current: boolean;
  device: { browser: string; os: string; label: string };
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  rememberMe: boolean;
}

export interface SecurityEvent {
  id: string;
  action: string;
  label: string;
  alert: boolean;
  device: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export const SESSIONS_QUERY_KEY = ['auth', 'sessions'];
export const SECURITY_ACTIVITY_QUERY_KEY = ['auth', 'activity'];

export function useSessions() {
  return useQuery({ queryKey: SESSIONS_QUERY_KEY, queryFn: () => api.get<DeviceSession[]>('/auth/sessions') });
}

export function useSecurityActivity() {
  return useQuery({ queryKey: SECURITY_ACTIVITY_QUERY_KEY, queryFn: () => api.get<SecurityEvent[]>('/auth/activity') });
}
