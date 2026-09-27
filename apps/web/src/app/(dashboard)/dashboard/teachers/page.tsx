'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createTeacherAssignmentSchema, createTeacherSchema, type CreateTeacherInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemberships } from '../../../../hooks/useMemberships';
import { useTeachers, TEACHERS_QUERY_KEY, useTeacherAssignments, teacherAssignmentsQueryKey } from '../../../../hooks/useTeachers';
import { useClasses } from '../../../../hooks/useClasses';
import { useSections } from '../../../../hooks/useSections';
import { useSubjects } from '../../../../hooks/useSubjects';
import { api, ApiError } from '../../../../lib/api-client';

export default function TeachersPage() {
  const { data: memberships } = useMemberships();
  const { data: teachers } = useTeachers();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

  const teacherUserIds = new Set(teachers?.map((t) => t.user.id));
  const eligibleMembers = memberships?.filter((m) => m.status === 'ACTIVE' && !teacherUserIds.has(m.user.id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeacherInput>({ resolver: zodResolver(createTeacherSchema) });

  const onCreate = async (data: CreateTeacherInput) => {
    setServerError(null);
    try {
      await api.post('/teachers', data);
      await queryClient.invalidateQueries({ queryKey: TEACHERS_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create teacher profile.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Teachers</h1>
          <p className="mt-1 text-slate-600">Manage teacher profiles and their class/subject assignments.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>New teacher profile</Button>}
      </div>

      {creating && (
        <Card className="mt-6 p-6">
          <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
            {serverError && <Alert variant="error">{serverError}</Alert>}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy" htmlFor="userId">
                Staff member
              </label>
              <select
                id="userId"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
                {...register('userId')}
              >
                <option value="">Select a staff member</option>
                {eligibleMembers?.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.firstName} {m.user.lastName} ({m.user.email})
                  </option>
                ))}
              </select>
              {errors.userId && <p className="text-sm text-red-600">{errors.userId.message}</p>}
              {eligibleMembers?.length === 0 && (
                <p className="text-sm text-slate-500">
                  Every active staff member already has a teacher profile. Invite more staff first.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Employee code"
                placeholder="EMP-001"
                helperText="Optional."
                error={errors.employeeCode?.message}
                {...register('employeeCode')}
              />
              <TextField label="Joining date" type="date" error={errors.joiningDate?.message} {...register('joiningDate')} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting}>
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {teachers?.map((teacher) => (
          <Card key={teacher.id} className="p-0">
            <button
              onClick={() => setExpandedTeacherId(expandedTeacherId === teacher.id ? null : teacher.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                {expandedTeacherId === teacher.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-medium text-navy">
                  {teacher.user.firstName} {teacher.user.lastName}
                </span>
                <span className="text-sm text-slate-400">{teacher.user.email}</span>
              </div>
              {teacher.employeeCode && <span className="text-sm text-slate-500">{teacher.employeeCode}</span>}
            </button>
            {expandedTeacherId === teacher.id && (
              <div className="border-t border-slate-200 p-4">
                <AssignmentsPanel teacherId={teacher.id} />
              </div>
            )}
          </Card>
        ))}
        {teachers?.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-slate-500">No teacher profiles yet.</p>
        )}
      </div>
    </div>
  );
}

function AssignmentsPanel({ teacherId }: { teacherId: string }) {
  const { data: assignments } = useTeacherAssignments(teacherId);
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const { data: sectionsForClass } = useSections(selectedClassId || undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createTeacherAssignmentSchema), defaultValues: { sectionId: '', subjectId: '' } });

  const onAdd = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await api.post(`/teachers/${teacherId}/assignments`, data);
      await queryClient.invalidateQueries({ queryKey: teacherAssignmentsQueryKey(teacherId) });
      reset();
      setSelectedClassId('');
      setAdding(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not add assignment.');
    }
  });

  const removeAssignment = async (assignmentId: string) => {
    setBusyAssignmentId(assignmentId);
    try {
      await api.delete(`/teachers/${teacherId}/assignments/${assignmentId}`);
      await queryClient.invalidateQueries({ queryKey: teacherAssignmentsQueryKey(teacherId) });
    } finally {
      setBusyAssignmentId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {assignments?.map((a) => (
        <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-sm text-navy">
            {a.section.class.name} - {a.section.name} · <span className="font-medium">{a.subject.name}</span>
          </p>
          <Button
            size="sm"
            variant="danger"
            loading={busyAssignmentId === a.id}
            onClick={() => removeAssignment(a.id)}
          >
            Remove
          </Button>
        </div>
      ))}
      {assignments?.length === 0 && !adding && <p className="text-sm text-slate-500">No assignments yet.</p>}

      {adding ? (
        <form onSubmit={onAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-3 gap-2">
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setValue('sectionId', '');
              }}
            >
              <option value="">Class</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              disabled={!selectedClassId}
              {...register('sectionId')}
            >
              <option value="">Section</option>
              {sectionsForClass?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
              {...register('subjectId')}
            >
              <option value="">Subject</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {(errors.sectionId || errors.subjectId) && (
            <p className="text-sm text-red-600">Choose a class, section, and subject.</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Add assignment
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setAdding(false);
                setSelectedClassId('');
                reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          Add assignment
        </Button>
      )}
    </div>
  );
}
