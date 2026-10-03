import type { PaymentMethod } from '@prisma/client';

// Which ways of paying this deployment accepts. Today that is cash only — there
// is no payment gateway, and cheque / bank transfer / UPI aren't switched on.
// When one is, add it to PAYMENT_METHODS (e.g. PAYMENT_METHODS="CASH,CHEQUE") and
// the API and the screens follow; no code change.
const KNOWN: PaymentMethod[] = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE'];

export function enabledPaymentMethods(env: Record<string, string | undefined> = process.env): PaymentMethod[] {
  const wanted = (env.PAYMENT_METHODS ?? 'CASH')
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m): m is PaymentMethod => (KNOWN as string[]).includes(m));
  return wanted.length > 0 ? [...new Set(wanted)] : ['CASH'];
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};
