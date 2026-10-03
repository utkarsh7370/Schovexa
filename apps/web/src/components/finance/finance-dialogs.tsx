'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, SelectField, TextAreaField, TextField, useToast } from '@schovexa/ui';
import { api, ApiError } from '../../lib/api-client';
import { formatMinor, majorToMinor } from '../../lib/currency';
import { useFinanceConfig, type ConcessionKind } from '../../hooks/useFinance';
import { CONCESSION_KIND_LABELS } from './finance-ui';

/** Anything money-related changed — refresh every finance screen and the fee lists. */
export function useRefreshFinance() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance'] }),
      queryClient.invalidateQueries({ queryKey: ['student-fees'] }),
      queryClient.invalidateQueries({ queryKey: ['fees-outstanding'] }),
    ]);
  };
}

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// ---------------------------------------------------------------------------

export interface CorrectablePayment {
  id: string;
  amountMinor: number;
  paidAt: string;
  receivedFrom: string | null;
  note: string | null;
  reference: string | null;
  receiptNo: string | null;
  hasRefunds?: boolean;
}

/** Fixes a payment that was entered wrongly. A reason is required and the old values stay in the activity log. */
export function CorrectPaymentDialog({ payment, onClose }: { payment: CorrectablePayment | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const toast = useToast();
  const { data: config } = useFinanceConfig();
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setAmount((payment.amountMinor / 100).toFixed(2));
    setPaidAt(payment.paidAt.slice(0, 10));
    setReceivedFrom(payment.receivedFrom ?? '');
    setReference(payment.reference ?? '');
    setNote(payment.note ?? '');
    setReason('');
    setError(null);
    setFieldErrors({});
  }, [payment]);

  if (!payment) return null;

  const submit = async () => {
    const errors: { amount?: string; reason?: string } = {};
    const amountMinor = majorToMinor(Number(amount));
    if (!amount || Number.isNaN(amountMinor) || amountMinor <= 0) errors.amount = 'Enter the correct amount.';
    if (reason.trim().length < 5) errors.reason = 'Say why it is being corrected (at least 5 characters).';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    // Send only what changed — the log then shows exactly what was fixed.
    const body: Record<string, unknown> = { reason: reason.trim() };
    if (amountMinor !== payment.amountMinor) body.amountMinor = amountMinor;
    if (paidAt && paidAt !== payment.paidAt.slice(0, 10)) body.paidAt = paidAt;
    if (receivedFrom !== (payment.receivedFrom ?? '')) body.receivedFrom = receivedFrom;
    if (reference !== (payment.reference ?? '')) body.reference = reference;
    if (note !== (payment.note ?? '')) body.note = note;
    if (Object.keys(body).length === 1) {
      setError('Change at least one thing about the payment.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/payments/${payment.id}`, body);
      await refresh();
      toast.show({ tone: 'success', title: 'Payment corrected', description: 'The old values are kept in the activity log.' });
      onClose();
    } catch (err) {
      setError(message(err, 'Could not correct the payment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Correct a payment"
      description={`${payment.receiptNo ? `Receipt ${payment.receiptNo}` : 'Payment'} — corrections are limited to ${config?.paymentCorrectionWindowDays ?? 2} days after it was recorded.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save correction</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        {payment.hasRefunds && <Alert variant="warning">This payment has a refund against it, so the amount can’t be changed.</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Amount (₹)" type="number" step="0.01" min="0" value={amount} error={fieldErrors.amount} disabled={payment.hasRefunds} onChange={(e) => setAmount(e.target.value)} />
          <TextField label="Payment date" type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidAt(e.target.value)} />
          <TextField label="Received from" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} />
          <TextField label="Voucher / reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <TextAreaField label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <TextAreaField label="Reason for the correction (required)" rows={2} value={reason} error={fieldErrors.reason} placeholder="e.g. Typed 2,000 instead of 2,500" onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export interface RefundablePayment {
  id: string;
  receiptNo: string | null;
  studentName: string;
  amountMinor: number;
  refundableMinor: number;
}

/** Asks for a refund. Nothing moves until someone else approves it and it is paid out. */
export function RefundRequestDialog({ payment, onClose }: { payment: RefundablePayment | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setAmount((payment.refundableMinor / 100).toFixed(2));
    setReason('');
    setError(null);
    setFieldErrors({});
  }, [payment]);

  if (!payment) return null;

  const submit = async () => {
    const amountMinor = majorToMinor(Number(amount));
    const errors: { amount?: string; reason?: string } = {};
    if (!amount || Number.isNaN(amountMinor) || amountMinor <= 0) errors.amount = 'Enter the amount to refund.';
    else if (amountMinor > payment.refundableMinor) errors.amount = `At most ${formatMinor(payment.refundableMinor)} can still be refunded.`;
    if (reason.trim().length < 5) errors.reason = 'Say why the refund is needed (at least 5 characters).';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/refunds', { paymentId: payment.id, amountMinor, reason: reason.trim() });
      await refresh();
      toast.show({ tone: 'success', title: 'Refund requested', description: 'The Principal or Director will be asked to approve it.' });
      onClose();
    } catch (err) {
      setError(message(err, 'Could not request the refund.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request a refund"
      description={`${payment.studentName}${payment.receiptNo ? ` · receipt ${payment.receiptNo}` : ''} · paid ${formatMinor(payment.amountMinor)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Send for approval</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Alert variant="info">Refunds are approved by the Principal or Director, then paid back in cash. The fee balance only changes once the refund is paid out.</Alert>
        <TextField label="Amount to refund (₹)" type="number" step="0.01" min="0" value={amount} error={fieldErrors.amount} helperText={`Up to ${formatMinor(payment.refundableMinor)}`} onChange={(e) => setAmount(e.target.value)} />
        <TextAreaField label="Reason" rows={3} value={reason} error={fieldErrors.reason} placeholder="e.g. Child left the school; paid twice by mistake" onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export interface ConcessionTarget {
  id: string;
  studentName: string;
  feeCategory: string;
  amountDueMinor: number;
  balanceMinor: number;
}

/** A discount, scholarship or concession on one fee. A small discount applies at once; anything else waits for approval. */
export function ConcessionDialog({ fee, onClose }: { fee: ConcessionTarget | null; onClose: () => void }) {
  const refresh = useRefreshFinance();
  const toast = useToast();
  const { data: config } = useFinanceConfig();
  const [kind, setKind] = useState<ConcessionKind>('DISCOUNT');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; amount?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fee) return;
    setKind('DISCOUNT');
    setName('');
    setAmount('');
    setReason('');
    setError(null);
    setFieldErrors({});
  }, [fee]);

  if (!fee) return null;
  const limitMinor = Math.floor((fee.amountDueMinor * (config?.maxDiscountPercent ?? 5)) / 100);

  const submit = async () => {
    const amountMinor = majorToMinor(Number(amount));
    const errors: { name?: string; amount?: string; reason?: string } = {};
    if (name.trim().length < 2) errors.name = 'Give it a name, like “Sibling discount”.';
    if (!amount || Number.isNaN(amountMinor) || amountMinor <= 0) errors.amount = 'Enter the amount.';
    else if (amountMinor > fee.balanceMinor) errors.amount = `More than the ${formatMinor(fee.balanceMinor)} still owed.`;
    if (reason.trim().length < 5) errors.reason = 'Say why (at least 5 characters).';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.post<{ status: string }>('/concessions', { studentFeeId: fee.id, kind, name: name.trim(), amountMinor, reason: reason.trim() });
      await refresh();
      toast.show(
        result.status === 'APPLIED'
          ? { tone: 'success', title: `${CONCESSION_KIND_LABELS[kind]} applied`, description: `${formatMinor(amountMinor)} off ${fee.feeCategory}.` }
          : { tone: 'info', title: 'Sent for approval', description: 'It takes effect once the Principal or Director approves and it is applied.' },
      );
      onClose();
    } catch (err) {
      setError(message(err, 'Could not save the request.'));
    } finally {
      setSaving(false);
    }
  };

  const amountMinor = majorToMinor(Number(amount) || 0);
  const direct = kind === 'DISCOUNT' && amountMinor > 0 && amountMinor <= limitMinor;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Discount, scholarship or concession"
      description={`${fee.studentName} · ${fee.feeCategory} · still owed ${formatMinor(fee.balanceMinor)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{direct ? 'Apply now' : 'Send for approval'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Alert variant="info">
          A plain discount up to {config?.maxDiscountPercent ?? 5}% of the fee ({formatMinor(limitMinor)}) is applied straight away. Scholarships, concessions and bigger discounts are approved by the Principal or Director first.
        </Alert>
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as ConcessionKind)}>
          {Object.entries(CONCESSION_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Name" placeholder="e.g. Sibling discount" value={name} error={fieldErrors.name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Amount (₹)" type="number" step="0.01" min="0" value={amount} error={fieldErrors.amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <TextAreaField label="Reason" rows={2} value={reason} error={fieldErrors.reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}
