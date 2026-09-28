'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFeeCategorySchema, type CreateFeeCategoryInput } from '@schovexa/validation';
import { Button, Card, TextField, Alert } from '@schovexa/ui';
import { useFeeCategories, useFeeStructures, FEE_CATEGORIES_QUERY_KEY, feeStructuresQueryKey, useOutstandingFees, OUTSTANDING_QUERY_KEY } from '../../../../hooks/useFees';
import { useAcademicYears } from '../../../../hooks/useAcademicYears';
import { useClasses } from '../../../../hooks/useClasses';
import { formatMinor, majorToMinor } from '../../../../lib/currency';
import { api, ApiError } from '../../../../lib/api-client';

// The API speaks amountMinor (paise); this form collects a rupee amount
// from the user and converts it at submit time — see lib/currency.ts.
const structureFormSchema = z.object({
  feeCategoryId: z.string().min(1, 'Category is required'),
  academicYearId: z.string().min(1, 'Academic year is required'),
  classId: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
});
type StructureFormInput = z.infer<typeof structureFormSchema>;

const FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: 'One-time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
};

export default function FeesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-navy">Fees</h1>
        <p className="mt-1 text-slate-600">Fee categories, structures, and outstanding balances.</p>
      </div>

      <div className="mt-6">
        <CategoriesPanel />
      </div>
      <div className="mt-6">
        <StructuresPanel />
      </div>
      <div className="mt-6">
        <OutstandingPanel />
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const { data: categories } = useFeeCategories();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeeCategoryInput>({ resolver: zodResolver(createFeeCategorySchema) });

  const onCreate = async (data: CreateFeeCategoryInput) => {
    setServerError(null);
    try {
      await api.post('/fee-categories', data);
      await queryClient.invalidateQueries({ queryKey: FEE_CATEGORIES_QUERY_KEY });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create category.');
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Fee categories</h2>
        {!creating && (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            New category
          </Button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleSubmit(onCreate)} className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <TextField label="Name" placeholder="Tuition" error={errors.name?.message} {...register('name')} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Create
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {categories?.map((c) => (
          <span key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-navy">
            {c.name}
          </span>
        ))}
        {categories?.length === 0 && !creating && <p className="text-sm text-slate-500">No categories yet.</p>}
      </div>
    </Card>
  );
}

function StructuresPanel() {
  const { data: years } = useAcademicYears();
  const { data: categories } = useFeeCategories();
  const { data: classes } = useClasses();
  const { data: structures } = useFeeStructures();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StructureFormInput>({ resolver: zodResolver(structureFormSchema) });

  const onCreate = async (data: StructureFormInput) => {
    setServerError(null);
    try {
      await api.post('/fee-structures', {
        feeCategoryId: data.feeCategoryId,
        academicYearId: data.academicYearId,
        classId: data.classId || undefined,
        amountMinor: majorToMinor(data.amount),
        frequency: data.frequency,
      });
      await queryClient.invalidateQueries({ queryKey: feeStructuresQueryKey() });
      reset();
      setCreating(false);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create fee structure.');
    }
  };

  const assignToClass = async (structureId: string) => {
    setBusyId(structureId);
    try {
      const result = await api.post<{ assigned: number; alreadyAssigned: number }>(
        `/fee-structures/${structureId}/assign`,
      );
      setAssignResult((prev) => ({
        ...prev,
        [structureId]: `Assigned to ${result.assigned} student(s) (${result.alreadyAssigned} already had it).`,
      }));
      await queryClient.invalidateQueries({ queryKey: OUTSTANDING_QUERY_KEY });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Fee structures</h2>
        {!creating && (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            New structure
          </Button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleSubmit(onCreate)} className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          {serverError && <Alert variant="error">{serverError}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Category</label>
              <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue" {...register('feeCategoryId')}>
                <option value="">Select a category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.feeCategoryId && <p className="text-sm text-red-600">{errors.feeCategoryId.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Academic year</label>
              <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue" {...register('academicYearId')}>
                <option value="">Select a year</option>
                {years?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
              {errors.academicYearId && <p className="text-sm text-red-600">{errors.academicYearId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Class</label>
              <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue" {...register('classId')}>
                <option value="">All classes</option>
                {classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField label="Amount (₹)" type="number" step="0.01" error={errors.amount?.message} {...register('amount')} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy">Frequency</label>
              <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue" {...register('frequency')}>
                <option value="ONE_TIME">One-time</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Create
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {structures?.map((s) => (
          <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-navy">
                  {s.feeCategory.name} · {formatMinor(s.amountMinor)} · {FREQUENCY_LABELS[s.frequency]}
                </p>
                <p className="text-xs text-slate-500">{s.class ? s.class.name : 'All classes'}</p>
              </div>
              <Button size="sm" variant="secondary" loading={busyId === s.id} onClick={() => assignToClass(s.id)}>
                Assign to students
              </Button>
            </div>
            {assignResult[s.id] && <p className="mt-1 text-xs text-slate-500">{assignResult[s.id]}</p>}
          </div>
        ))}
        {structures?.length === 0 && !creating && <p className="text-sm text-slate-500">No fee structures yet.</p>}
      </div>
    </Card>
  );
}

function OutstandingPanel() {
  const { data: outstanding } = useOutstandingFees();

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-navy">Outstanding balances</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="py-2">Student</th>
              <th className="py-2">Category</th>
              <th className="py-2 text-right">Due</th>
              <th className="py-2 text-right">Paid</th>
              <th className="py-2 text-right">Balance</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {outstanding?.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-2 text-navy">
                  {row.student.firstName} {row.student.lastName}
                  <span className="ml-1 text-xs text-slate-400">{row.student.admissionNo}</span>
                </td>
                <td className="py-2 text-slate-600">{row.feeCategory.name}</td>
                <td className="py-2 text-right">{formatMinor(row.amountDueMinor)}</td>
                <td className="py-2 text-right">{formatMinor(row.paidMinor)}</td>
                <td className="py-2 text-right font-medium text-red-600">{formatMinor(row.balanceMinor)}</td>
                <td className="py-2 text-slate-600">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {outstanding?.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Nothing outstanding.</p>}
      </div>
    </Card>
  );
}
