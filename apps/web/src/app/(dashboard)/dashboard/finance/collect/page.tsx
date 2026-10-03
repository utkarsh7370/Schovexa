'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, EmptyState, PageHeader, SearchInput, SelectField, Skeleton, TextAreaField, TextField } from '@schovexa/ui';
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, Printer, Receipt, SearchX, UserRound, Wallet } from 'lucide-react';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { useFinanceConfig, useFinanceStudent, useFinanceStudentSearch, type FinanceFeeRow } from '../../../../../hooks/useFinance';
import { api, ApiError } from '../../../../../lib/api-client';
import { formatMinor, majorToMinor } from '../../../../../lib/currency';
import { FEE_STATUS_LABELS, FEE_STATUS_TONES, StudentPhoto, formatDay } from '../../../../../components/finance/finance-ui';

type Step = 'student' | 'fee' | 'payment' | 'review' | 'done';
const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'student', label: 'Find student' },
  { id: 'fee', label: 'Choose fee' },
  { id: 'payment', label: 'Payment' },
  { id: 'review', label: 'Review' },
];

interface Recorded {
  id: string;
  amountMinor: number;
  receipt: { id: string; receiptNo: string } | null;
}

function Stepper({ step }: { step: Step }) {
  const index = step === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < index;
        const current = i === index;
        return (
          <li key={s.id} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            <span
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                done ? 'bg-emerald-500 text-white' : current ? 'bg-brand-blue text-white shadow-glow' : 'bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {done ? <CheckCircle2 size={16} /> : i + 1}
            </span>
            <span className={current ? 'font-semibold text-navy' : done ? 'font-medium text-slate-600' : 'text-slate-400'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-6 bg-slate-200 sm:block" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function CollectFee() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: config } = useFinanceConfig();

  const [step, setStep] = useState<Step>(params.get('student') ? 'fee' : 'student');
  const [studentId, setStudentId] = useState<string | undefined>(params.get('student') ?? undefined);
  const [feeId, setFeeId] = useState<string | undefined>(params.get('fee') ?? undefined);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(search, 250);
  const { data: hits, isFetching: searching } = useFinanceStudentSearch(debounced);
  const { data: student, isLoading: studentLoading, isError: studentError } = useFinanceStudent(studentId);

  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recorded, setRecorded] = useState<Recorded | null>(null);

  const fee: FinanceFeeRow | undefined = student?.fees.find((f) => f.id === feeId);
  const unpaid = student?.fees.filter((f) => f.status !== 'WAIVED' && f.status !== 'PAID' && f.balanceMinor > 0) ?? [];
  const methods = config?.paymentMethods ?? [{ value: 'CASH', label: 'Cash' }];
  const partialAllowed = config?.allowPartialPayments ?? true;

  // Jumping straight to a fee from a student's page: start from the fee step, with its balance ready to take.
  useEffect(() => {
    if (fee && step === 'fee' && params.get('fee')) {
      setAmount((fee.balanceMinor / 100).toFixed(2));
      setStep('payment');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee?.id]);

  const pickStudent = (id: string) => {
    setStudentId(id);
    setFeeId(undefined);
    setStep('fee');
    router.replace(`/dashboard/finance/collect?student=${id}`);
  };

  const pickFee = (row: FinanceFeeRow) => {
    setFeeId(row.id);
    setAmount((row.balanceMinor / 100).toFixed(2));
    setReceivedFrom(student?.parents.find((p) => p.isPrimary)?.name ?? student?.parents[0]?.name ?? '');
    setMethod(methods[0]?.value ?? 'CASH');
    setErrors({});
    setServerError(null);
    setStep('payment');
  };

  const validatePayment = () => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) return setErrors({ amount: 'Enter the amount received.' }), false;
    if (!fee) return false;
    const minor = majorToMinor(value);
    if (minor > fee.balanceMinor) return setErrors({ amount: `That is more than the ${formatMinor(fee.balanceMinor)} still owed.` }), false;
    if (!partialAllowed && minor !== fee.balanceMinor) return setErrors({ amount: `This school takes full payment only: ${formatMinor(fee.balanceMinor)}.` }), false;
    setErrors({});
    return true;
  };

  const confirm = async () => {
    if (!fee) return;
    setSaving(true);
    setServerError(null);
    try {
      const result = await api.post<Recorded>(`/student-fees/${fee.id}/payments`, {
        amountMinor: majorToMinor(Number(amount)),
        method,
        receivedFrom: receivedFrom || undefined,
        reference: reference || undefined,
        note: note || undefined,
      });
      setRecorded(result);
      setStep('done');
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      await queryClient.invalidateQueries({ queryKey: ['student-fees'] });
      await queryClient.invalidateQueries({ queryKey: ['fees-outstanding'] });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not record the payment. Nothing was saved.');
      setStep('payment');
    } finally {
      setSaving(false);
    }
  };

  const reset = (keepStudent: boolean) => {
    setFeeId(undefined);
    setAmount('');
    setReference('');
    setNote('');
    setRecorded(null);
    setServerError(null);
    if (!keepStudent) {
      setStudentId(undefined);
      setSearch('');
      setStep('student');
      router.replace('/dashboard/finance/collect');
    } else {
      setStep('fee');
      router.replace(`/dashboard/finance/collect?student=${studentId}`);
    }
  };

  const card = 'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Finance" title="Collect fee" description="Find the student, choose the fee, take the payment, hand over the receipt." />
      <div className="mt-6">
        <Stepper step={step} />
      </div>

      {/* The student stays on screen once chosen, so it is always clear who is paying. */}
      {student && step !== 'student' && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-sky-50 to-white p-4 shadow-card">
          <StudentPhoto name={student.name} photoUrl={student.photoUrl} size={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-navy">{student.name}</p>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{student.admissionNo}</span> · {student.className ? `${student.className}${student.sectionName ? ` – ${student.sectionName}` : ''}` : 'No class'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Outstanding</p>
            <p className="text-lg font-extrabold text-amber-600">{formatMinor(student.summary.balanceMinor)}</p>
          </div>
          {step !== 'done' && (
            <Button size="sm" variant="secondary" onClick={() => reset(false)}>
              Change student
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 animate-fade-in-up" key={step}>
        {step === 'student' && (
          <section className={card}>
            <h2 className="text-base font-bold text-navy">Who is paying for?</h2>
            <p className="mt-1 text-sm text-slate-500">Search by student name, admission number, or a parent’s name or phone.</p>
            <div className="mt-4">
              <SearchInput value={search} onChange={setSearch} placeholder="Start typing a name, admission number or phone…" aria-label="Search students" autoFocus />
            </div>
            <div className="mt-4">
              {!debounced.trim() && <EmptyState icon={<UserRound size={22} />} title="Search for a student" description="Results appear as you type." />}
              {debounced.trim() && searching && !hits && (
                <div className="flex flex-col gap-2" role="status" aria-label="Searching">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              )}
              {hits && debounced.trim() && hits.data.length === 0 && <EmptyState icon={<SearchX size={22} />} title="No student found" description="Check the spelling, or try the admission number." />}
              <ul className="flex flex-col gap-2">
                {hits?.data.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickStudent(s.id)}
                      className="flex w-full items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition-all hover:border-brand-blue/40 hover:bg-white hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20"
                    >
                      <StudentPhoto name={s.name} photoUrl={s.photoUrl} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-navy">{s.name}</span>
                        <span className="block text-xs text-slate-500">
                          <span className="font-mono">{s.admissionNo}</span> · {s.className ? `${s.className}${s.sectionName ? ` – ${s.sectionName}` : ''}` : 'No class'}
                          {s.status !== 'ENROLLED' && <> · {s.status.toLowerCase()}</>}
                        </span>
                      </span>
                      <span className="text-right">
                        {s.balanceMinor > 0 ? (
                          <>
                            <span className="block text-sm font-bold text-amber-600">{formatMinor(s.balanceMinor)}</span>
                            <span className="block text-[11px] text-slate-400">{s.overdueMinor > 0 ? `${formatMinor(s.overdueMinor)} overdue` : 'outstanding'}</span>
                          </>
                        ) : (
                          <Badge tone="success">All paid</Badge>
                        )}
                      </span>
                      <ArrowRight size={16} className="text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {step === 'fee' && (
          <section className={card}>
            <h2 className="text-base font-bold text-navy">Which fee?</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the fee this payment is for.</p>
            <div className="mt-4 flex flex-col gap-3">
              {studentLoading && <Skeleton className="h-24 w-full rounded-xl" />}
              {studentError && <Alert variant="error">We couldn’t load this student. Go back and search again.</Alert>}
              {student && unpaid.length === 0 && <EmptyState icon={<CheckCircle2 size={22} />} title="Nothing to collect" description={student.fees.length ? 'Every fee for this student is paid or waived.' : 'No fees have been assigned to this student yet.'} />}
              {unpaid.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pickFee(f)}
                  className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-left transition-all hover:border-brand-blue/40 hover:bg-white hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-bold text-navy">
                        {f.feeCategory}
                        <Badge tone={FEE_STATUS_TONES[f.status]}>{FEE_STATUS_LABELS[f.status]}</Badge>
                        {f.overdue && <Badge tone="danger">Overdue</Badge>}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Billed {formatMinor(f.netDueMinor)}
                        {f.discountMinor > 0 && <> (after {formatMinor(f.discountMinor)} discount)</>} · Paid {formatMinor(f.paidMinor)} · Due {formatDay(f.dueDate)}
                      </p>
                      {f.lateFeeMinor > 0 && <p className="mt-1 text-xs font-semibold text-rose-600">Late fee so far: {formatMinor(f.lateFeeMinor)} ({f.daysLate} days) — shown, not added</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Balance</p>
                      <p className="text-lg font-extrabold text-amber-600">{formatMinor(f.balanceMinor)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-between">
              <Button variant="secondary" onClick={() => reset(false)}>
                <ArrowLeft size={16} /> Back
              </Button>
              {student && (
                <Link href={`/dashboard/finance/students/${student.id}`} className="self-center text-sm font-semibold text-brand-blue hover:underline">
                  Open full finance profile
                </Link>
              )}
            </div>
          </section>
        )}

        {step === 'payment' && fee && (
          <section className={card}>
            <h2 className="text-base font-bold text-navy">Payment details</h2>
            <p className="mt-1 text-sm text-slate-500">
              {fee.feeCategory} · balance <span className="font-bold text-amber-600">{formatMinor(fee.balanceMinor)}</span>
            </p>
            {serverError && (
              <Alert variant="error" className="mt-4">
                {serverError}
              </Alert>
            )}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {methods.length > 1 ? (
                <SelectField label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </SelectField>
              ) : (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Payment method</p>
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-navy">
                    <Banknote size={16} className="text-emerald-600" /> {methods[0]?.label ?? 'Cash'}
                    <span className="ml-auto text-xs font-normal text-slate-400">The only method accepted</span>
                  </div>
                </div>
              )}
              <TextField label="Amount received (₹)" type="number" step="0.01" min="0" inputMode="decimal" value={amount} error={errors.amount} helperText={partialAllowed ? 'Part payment is fine — the rest stays on the fee.' : 'Full payment only.'} onChange={(e) => setAmount(e.target.value)} />
              <TextField label="Received from" placeholder="Who handed over the money" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} />
              <TextField label="Receipt-book / voucher no. (optional)" placeholder="e.g. BOOK-17" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="mt-4">
              <TextAreaField label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="mt-5 flex justify-between">
              <Button variant="secondary" onClick={() => setStep('fee')}>
                <ArrowLeft size={16} /> Back
              </Button>
              <Button
                onClick={() => {
                  if (validatePayment()) setStep('review');
                }}
              >
                Review <ArrowRight size={16} />
              </Button>
            </div>
          </section>
        )}

        {step === 'review' && fee && student && (
          <section className={card}>
            <h2 className="text-base font-bold text-navy">Check and confirm</h2>
            <p className="mt-1 text-sm text-slate-500">A receipt is issued as soon as you confirm. A mistake can be corrected afterwards, with a reason.</p>
            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ['Student', `${student.name} (${student.admissionNo})`],
                ['Fee', fee.feeCategory],
                ['Method', methods.find((m) => m.value === method)?.label ?? method],
                ['Received from', receivedFrom || '—'],
                ['Voucher no.', reference || '—'],
                ['Note', note || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-navy">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-white p-5 ring-1 ring-inset ring-emerald-200">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Amount to record</p>
                <p className="text-3xl font-extrabold text-emerald-700">{formatMinor(majorToMinor(Number(amount)))}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>Balance now {formatMinor(fee.balanceMinor)}</p>
                <p className="font-bold text-navy">Balance after {formatMinor(fee.balanceMinor - majorToMinor(Number(amount)))}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-between">
              <Button variant="secondary" onClick={() => setStep('payment')} disabled={saving}>
                <ArrowLeft size={16} /> Edit
              </Button>
              <Button loading={saving} onClick={confirm}>
                <Wallet size={16} /> Confirm payment
              </Button>
            </div>
          </section>
        )}

        {step === 'done' && recorded && (
          <section className={`${card} text-center`}>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow">
              <CheckCircle2 size={32} />
            </span>
            <h2 className="mt-4 text-2xl font-extrabold text-navy">Payment recorded</h2>
            <p className="mt-1 text-slate-500">
              {formatMinor(recorded.amountMinor)} received{student ? ` for ${student.name}` : ''}.
            </p>
            {recorded.receipt && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2 text-sm">
                <Receipt size={16} className="text-brand-blue" /> Receipt <span className="font-mono font-bold text-navy">{recorded.receipt.receiptNo}</span>
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {recorded.receipt && (
                <Link href={`/dashboard/receipts/${recorded.receipt.id}?print=1`}>
                  <Button>
                    <Printer size={16} /> Print receipt
                  </Button>
                </Link>
              )}
              {studentId && (
                <Button variant="secondary" onClick={() => reset(true)}>
                  Collect another fee for this student
                </Button>
              )}
              <Button variant="secondary" onClick={() => reset(false)}>
                Next student
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function CollectFeePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-4xl" />}>
      <CollectFee />
    </Suspense>
  );
}
