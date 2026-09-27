'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useRoles, usePermissionCatalog, ROLES_QUERY_KEY } from '../../../../hooks/useRoles';
import { api, ApiError } from '../../../../lib/api-client';

export default function RolesPage() {
  const { data: roles } = useRoles();
  const { data: permissions } = usePermissionCatalog();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submitCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Simplified picker: every checked permission grants ALL_SCHOOL,
      // not read-only. A full per-permission scope/readOnly selector is
      // a further UI refinement, not required for a school to create a
      // usable custom role today.
      await api.post('/roles', {
        name,
        permissions: [...selectedKeys].map((permissionKey) => ({ permissionKey, scope: 'ALL_SCHOOL' })),
      });
      await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      setCreating(false);
      setName('');
      setSelectedKeys(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Roles</h1>
          <p className="mt-1 text-slate-600">Manage roles and what each one can access.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>New role</Button>}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Create a role</h2>
          {error && (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          )}
          <div className="mt-4 flex flex-col gap-4">
            <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} />

            <div>
              <p className="mb-2 text-sm font-medium text-navy">Permissions (school-wide access)</p>
              <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                {permissions?.map((permission) => (
                  <label key={permission.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(permission.key)}
                      onChange={() => toggleKey(permission.key)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                    />
                    {permission.key}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={submitCreate} loading={submitting} disabled={!name}>
                Create role
              </Button>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {roles?.map((role) => (
          <Card key={role.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy">{role.name}</h3>
              {role.isSystem && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  Default
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {role.permissions.map((p) => (
                <span
                  key={p.permissionKey}
                  className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue"
                >
                  {p.permissionKey}
                  {p.readOnly ? ' (read-only)' : ''}
                </span>
              ))}
              {role.permissions.length === 0 && <span className="text-xs text-slate-400">No permissions granted</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
