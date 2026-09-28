'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, TextField, Alert, PageHeader, Badge } from '@schovexa/ui';
import { ShieldCheck } from 'lucide-react';
import { useRoles, usePermissionCatalog, ROLES_QUERY_KEY } from '../../../../hooks/useRoles';
import { api, ApiError } from '../../../../lib/api-client';

// School modules a permission's `module` field maps to, in plain
// language — grouped headings for the picker instead of one long
// alphabetical checkbox list of raw permission keys.
const MODULE_LABELS: Record<string, string> = {
  student: 'Students',
  parent: 'Parents',
  teacher: 'Teachers',
  class: 'Classes',
  subject: 'Subjects',
  attendance: 'Attendance',
  fee: 'Fees',
  notice: 'Notices',
  user: 'Staff & Invitations',
  role: 'Roles',
  school: 'School Settings',
  academicYear: 'Academic Years',
  document: 'Documents',
};

export default function RolesPage() {
  const { data: roles } = useRoles();
  const { data: permissions } = usePermissionCatalog();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const descriptionByKey = useMemo(() => {
    const map = new Map<string, string>();
    permissions?.forEach((p) => map.set(p.key, p.description ?? p.key));
    return map;
  }, [permissions]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, typeof permissions>();
    permissions?.forEach((p) => {
      const list = groups.get(p.module) ?? [];
      list.push(p);
      groups.set(p.module, list);
    });
    return groups;
  }, [permissions]);

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
      <PageHeader
        title="Roles"
        description="Control what each type of staff member can see and do."
        action={!creating && <Button onClick={() => setCreating(true)}>New role</Button>}
      />

      {creating && (
        <Card className="mt-6 p-6">
          <h2 className="text-base font-semibold text-navy">Create a role</h2>
          {error && (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          )}
          <div className="mt-4 flex flex-col gap-4">
            <TextField
              label="Role name"
              placeholder="e.g. Librarian, Front Desk"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-navy">What can this role do?</p>
              <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 p-3">
                {[...groupedPermissions.entries()].map(([module, perms]) => (
                  <div key={module}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {MODULE_LABELS[module] ?? module}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {perms?.map((permission) => (
                        <label key={permission.key} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(permission.key)}
                            onChange={() => toggleKey(permission.key)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                          />
                          {permission.description ?? permission.key}
                        </label>
                      ))}
                    </div>
                  </div>
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
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                <ShieldCheck size={16} />
              </div>
              <h3 className="font-semibold text-navy">{role.name}</h3>
              {role.isSystem && <Badge tone="neutral">Built-in</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions.map((p) => (
                <span
                  key={p.permissionKey}
                  className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-xs font-medium text-brand-blue"
                >
                  {descriptionByKey.get(p.permissionKey) ?? p.permissionKey}
                  {p.readOnly ? ' (view only)' : ''}
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
