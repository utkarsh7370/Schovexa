import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  module: string;
  resourceType: string | null;
  resourceId: string | null;
  actor: { id: string; name: string; email: string } | null;
  ipAddress: string | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditPage {
  data: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  modules: string[];
}

export interface AuditParams {
  page: number;
  pageSize: number;
  q?: string;
  module?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(params: AuditParams) {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  for (const key of ['q', 'module', 'from', 'to'] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api.get<AuditPage>(`/audit-logs?${query}`),
    placeholderData: keepPreviousData,
  });
}
