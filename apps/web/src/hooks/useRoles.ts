import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface RolePermissionSummary {
  permissionKey: string;
  scope: string;
  readOnly: boolean;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: RolePermissionSummary[];
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string | null;
}

export const ROLES_QUERY_KEY = ['roles'];
export const PERMISSIONS_QUERY_KEY = ['permissions'];

export function useRoles() {
  return useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: () => api.get<Role[]>('/roles') });
}

export function usePermissionCatalog() {
  return useQuery({ queryKey: PERMISSIONS_QUERY_KEY, queryFn: () => api.get<Permission[]>('/permissions') });
}
