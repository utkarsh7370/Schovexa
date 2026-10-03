import { StudentFeeStatus } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';

// One definition of "how much is owed on a fee", used by the fee screens, the
// ledger, the dashboard and every report, so they can never disagree.
//   owed now = amount billed − discounts − (money paid − money refunded)
export interface FeeMoneyInput {
  amountDueMinor: number;
  discountMinor: number;
  payments: { amountMinor: number }[];
  refunds?: { amountMinor: number; status: string }[];
}

export interface FeeMoney {
  /** What the family has to pay after discounts. */
  netDueMinor: number;
  /** Everything ever paid on this fee. */
  grossPaidMinor: number;
  refundedMinor: number;
  /** Paid, less what was given back — what the school is actually holding for this fee. */
  paidMinor: number;
  balanceMinor: number;
}

export function feeMoney(fee: FeeMoneyInput): FeeMoney {
  const netDueMinor = Math.max(fee.amountDueMinor - fee.discountMinor, 0);
  const grossPaidMinor = fee.payments.reduce((sum, p) => sum + p.amountMinor, 0);
  const refundedMinor = (fee.refunds ?? []).filter((r) => r.status === 'PROCESSED').reduce((sum, r) => sum + r.amountMinor, 0);
  const paidMinor = grossPaidMinor - refundedMinor;
  return { netDueMinor, grossPaidMinor, refundedMinor, paidMinor, balanceMinor: Math.max(netDueMinor - paidMinor, 0) };
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Re-derives a fee's status from its payments, refunds and discounts. A waived fee stays waived. */
export async function recomputeFeeStatus(db: Db, studentFeeId: string): Promise<StudentFeeStatus> {
  const fee = await db.studentFee.findUniqueOrThrow({
    where: { id: studentFeeId },
    include: { payments: { where: { deletedAt: null } }, refunds: { where: { status: 'PROCESSED' } } },
  });
  if (fee.status === StudentFeeStatus.WAIVED) return fee.status;
  const money = feeMoney(fee);
  const status =
    money.balanceMinor === 0 ? StudentFeeStatus.PAID : money.paidMinor > 0 ? StudentFeeStatus.PARTIALLY_PAID : StudentFeeStatus.PENDING;
  if (status !== fee.status) await db.studentFee.update({ where: { id: studentFeeId }, data: { status } });
  return status;
}
