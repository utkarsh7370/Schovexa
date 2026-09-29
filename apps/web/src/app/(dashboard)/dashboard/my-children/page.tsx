'use client';

import { Card, Spinner, PageHeader, EmptyState, SkeletonRows } from '@schovexa/ui';
import { Heart } from 'lucide-react';
import { useStudents, useStudent } from '../../../../hooks/useStudents';
import { useAttendanceHistory, type AttendanceStatus } from '../../../../hooks/useAttendance';
import { useStudentFees } from '../../../../hooks/useFees';
import { formatMinor } from '../../../../lib/currency';

// This page's real audience is a Parent (GET /students already scopes
// down to just their linked children — see the OWN_CHILDREN fix in
// students.service.ts). Nothing stops another role from visiting it too
// (nav items are shown to every role, docs/frontend-architecture.md §5 —
// each route enforces its own permission server-side regardless), but a
// Director's whole-school roster would otherwise mean three extra
// requests per student here. Capped rather than paginated: a genuine
// parent never has more than a handful of children.
const MAX_CHILDREN_SHOWN = 12;

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ChildCard({ studentId }: { studentId: string }) {
  const { data: student } = useStudent(studentId);
  const to = toDateInput(new Date());
  const from = toDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const { data: history } = useAttendanceHistory(studentId, from, to);
  const { data: fees } = useStudentFees(studentId);

  if (!student) {
    return (
      <Card className="flex justify-center p-6">
        <Spinner size={20} />
      </Card>
    );
  }

  const counts = (history ?? []).reduce<Record<AttendanceStatus, number>>(
    (acc, record) => {
      acc[record.status] += 1;
      return acc;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 },
  );
  const totalBalanceMinor = (fees ?? []).reduce((sum, fee) => sum + fee.balanceMinor, 0);

  return (
    <Card className="p-6">
      <div>
        <p className="text-lg font-semibold text-navy">
          {student.firstName} {student.lastName}
        </p>
        <p className="text-sm text-slate-500">
          Admission no. {student.admissionNo}
          {student.section && (
            <>
              {' · '}
              {student.section.class.name} - {student.section.name}
            </>
          )}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Present (30d)</p>
          <p className="mt-1 text-lg font-semibold text-green-600">{counts.PRESENT}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Absent (30d)</p>
          <p className="mt-1 text-lg font-semibold text-red-600">{counts.ABSENT}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Late (30d)</p>
          <p className="mt-1 text-lg font-semibold text-amber-600">{counts.LATE}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Fee balance</p>
          <p className={`mt-1 text-lg font-semibold ${totalBalanceMinor > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatMinor(totalBalanceMinor)}
          </p>
        </div>
      </div>

      {fees && fees.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-slate-200 pt-4">
          {fees.map((fee) => (
            <div key={fee.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{fee.feeCategory.name}</span>
              <span className="text-slate-500">
                Due {formatMinor(fee.amountDueMinor)} · Paid {formatMinor(fee.paidMinor)} · {fee.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-500">No fees assigned yet.</p>
      )}
    </Card>
  );
}

export default function MyChildrenPage() {
  const { data: students, isLoading } = useStudents();
  const shown = students?.slice(0, MAX_CHILDREN_SHOWN);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Children" description="Attendance and fee status for your linked children." />

      <div className="mt-6 flex flex-col gap-4">
        {isLoading && <SkeletonRows count={2} />}
        {!isLoading && students?.length === 0 && (
          <EmptyState
            icon={<Heart size={22} />}
            title="No children linked to your account yet"
            description="Contact the school office to get your children linked."
          />
        )}
        {shown?.map((student) => (
          <ChildCard key={student.id} studentId={student.id} />
        ))}
        {students && students.length > MAX_CHILDREN_SHOWN && (
          <p className="text-center text-sm text-slate-500">
            Showing the first {MAX_CHILDREN_SHOWN} of {students.length}.
          </p>
        )}
      </div>
    </div>
  );
}
