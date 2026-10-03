import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignFeeToStudentInput, RecordPaymentInput, UpdateStudentFeeInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';
import { SchoolSettingsService } from '../school-settings/school-settings.service';
import { dateOnlyToIso, todayInTimezone } from '../common/dates.util';
import { AuditService } from '../audit/audit.service';
import { FeeNotifierService } from '../finance/fee-notifier.service';
import { feeMoney, recomputeFeeStatus } from '../finance/fee-math';
import { formatMoney } from '../finance/money';
import { enabledPaymentMethods, PAYMENT_METHOD_LABELS } from '../finance/payment-methods';

const FEE_INCLUDE = {
  feeStructure: { include: { feeCategory: true } },
  payments: { where: { deletedAt: null } },
  refunds: { where: { status: 'PROCESSED' as const } },
} as const;
type FeeWithRelations = Prisma.StudentFeeGetPayload<{ include: typeof FEE_INCLUDE }>;
interface FeeRules {
  today: string;
  perDayMinor: number;
  graceDays: number;
}

@Injectable()
export class StudentFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SchoolSettingsService,
    private readonly audit: AuditService,
    private readonly notifier: FeeNotifierService,
  ) {}

  // The school's late-fee rule and its own "today", read once per request.
  private async feeRules(schoolId: string): Promise<FeeRules> {
    const [school, settings] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } }),
      this.settings.get(schoolId),
    ]);
    return { today: todayInTimezone(school?.timezone), perDayMinor: settings.lateFeePerDayMinor, graceDays: settings.lateFeeGraceDays };
  }

  async listForStudent(schoolId: string, studentId: string) {
    const fees = await this.prisma.studentFee.findMany({
      where: { schoolId, studentId, deletedAt: null },
      include: FEE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const rules = await this.feeRules(schoolId);
    return fees.map((fee) => this.toDto(fee, rules));
  }

  // Looked up before authorizeResource() runs — the controller needs
  // this row's studentId to know what to authorize against, and this
  // 404s on a cross-tenant id before any scope check even happens.
  async findForAuth(schoolId: string, studentFeeId: string) {
    const fee = await this.prisma.studentFee.findFirst({ where: { id: studentFeeId, schoolId, deletedAt: null } });
    if (!fee) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return fee;
  }

  async assign(schoolId: string, studentId: string, input: AssignFeeToStudentInput) {
    const structure = await this.prisma.feeStructure.findFirst({
      where: { id: input.feeStructureId, schoolId, deletedAt: null },
    });
    if (!structure) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown fee structure.' });
    }

    const existing = await this.prisma.studentFee.findFirst({
      where: { schoolId, studentId, feeStructureId: input.feeStructureId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This fee is already assigned to this student.',
      });
    }

    const fee = await this.prisma.studentFee.create({
      data: {
        schoolId,
        studentId,
        feeStructureId: input.feeStructureId,
        amountDueMinor: input.amountDueMinor ?? structure.amountMinor,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: FEE_INCLUDE,
    });
    return this.toDto(fee, await this.feeRules(schoolId));
  }

  // A manual correction path (rare, pre-payment) — deliberately does not
  // recompute status the way recordPayment() does, since that's the one
  // real flow this needs to stay correct for.
  async update(schoolId: string, studentFeeId: string, input: UpdateStudentFeeInput) {
    const existing = await this.findForAuth(schoolId, studentFeeId);
    if (existing.status === StudentFeeStatus.WAIVED) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This fee has been waived.' });
    }

    await this.prisma.studentFee.update({
      where: { id: studentFeeId },
      data: {
        ...(input.amountDueMinor !== undefined ? { amountDueMinor: input.amountDueMinor } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      },
    });
    await recomputeFeeStatus(this.prisma, studentFeeId);
    return this.toDto(await this.prisma.studentFee.findUniqueOrThrow({ where: { id: studentFeeId }, include: FEE_INCLUDE }), await this.feeRules(schoolId));
  }

  // "Process a fee refund" (fee.refund, docs/permissions.md) maps to
  // waiving the due amount here — there is no online-payment ledger to
  // reverse in MVP (Phase 2, docs/architecture.md §10), so this is the
  // administrative cancellation the schema actually supports
  // (StudentFeeStatus.WAIVED).
  async waive(schoolId: string, studentFeeId: string) {
    await this.findForAuth(schoolId, studentFeeId);
    const fee = await this.prisma.studentFee.update({
      where: { id: studentFeeId },
      data: { status: StudentFeeStatus.WAIVED },
      include: FEE_INCLUDE,
    });
    return this.toDto(fee, await this.feeRules(schoolId));
  }

  async listPayments(schoolId: string, studentFeeId: string) {
    await this.findForAuth(schoolId, studentFeeId);
    return this.prisma.payment.findMany({
      where: { schoolId, studentFeeId, deletedAt: null },
      include: { receipt: true },
      orderBy: { paidAt: 'desc' },
    });
  }

  async recordPayment(schoolId: string, studentFeeId: string, collectedById: string, input: RecordPaymentInput, meta: { ipAddress?: string | null; userAgent?: string | null } = {}) {
    const studentFee = await this.prisma.studentFee.findFirstOrThrow({ where: { id: studentFeeId, schoolId, deletedAt: null }, include: FEE_INCLUDE });
    if (studentFee.status === StudentFeeStatus.WAIVED) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This fee has been waived; no payment can be recorded.',
      });
    }

    // Only the payment methods this deployment has switched on (today: cash).
    const methods = enabledPaymentMethods();
    if (!methods.includes(input.method)) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_NOT_ENABLED',
        message: `${PAYMENT_METHOD_LABELS[input.method] ?? input.method} payments aren’t accepted here. Accepted: ${methods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join(', ')}.`,
        details: [{ field: 'method', message: 'This payment method isn’t switched on.' }],
      });
    }

    const money = feeMoney(studentFee);
    if (money.balanceMinor === 0) {
      throw new BadRequestException({ code: 'NOTHING_OWED', message: 'There is nothing outstanding on this fee.' });
    }
    if (input.amountMinor > money.balanceMinor) {
      throw new BadRequestException({
        code: 'AMOUNT_EXCEEDS_BALANCE',
        message: `That is more than the outstanding balance (${formatMoney(money.balanceMinor)}).`,
        details: [{ field: 'amountMinor', message: `At most ${formatMoney(money.balanceMinor)}.` }],
      });
    }

    const settings = await this.settings.get(schoolId);
    if (!settings.allowPartialPayments && input.amountMinor !== money.balanceMinor) {
      throw new BadRequestException({
        code: 'PARTIAL_PAYMENT_NOT_ALLOWED',
        message: 'This school only accepts full payment of a fee. Record the whole outstanding balance.',
        details: [{ field: 'amountMinor', message: 'Pay the full outstanding balance.' }],
      });
    }

    // Receipt numbers are a simple per-school sequential count, not a
    // dedicated counter table — safe enough for MVP's expected usage
    // (one accountant recording payments at a time), with a small retry
    // on the rare concurrent-collision case rather than a full
    // distributed-sequence design.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const recorded = await this.prisma.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              schoolId,
              studentFeeId,
              amountMinor: input.amountMinor,
              method: input.method,
              collectedById,
              paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
              receivedFrom: input.receivedFrom || null,
              note: input.note || null,
              reference: input.reference || null,
            },
          });

          const receiptCount = await tx.receipt.count({ where: { schoolId } });
          const receiptNo = `${settings.receiptPrefix}${String(receiptCount + 1).padStart(6, '0')}`;
          await tx.receipt.create({ data: { schoolId, paymentId: payment.id, receiptNo } });
          await recomputeFeeStatus(tx, studentFeeId);

          return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { receipt: true } });
        });

        await this.audit.record({
          schoolId,
          userId: collectedById,
          action: 'payment.recorded',
          module: 'payment',
          resourceType: 'Payment',
          resourceId: recorded.id,
          metadata: { amountMinor: recorded.amountMinor, method: recorded.method, receiptNo: recorded.receipt?.receiptNo ?? null, studentId: studentFee.studentId, studentFeeId },
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        });
        // Tell the family (in-app, and by email when set up). Never blocks or fails the payment.
        void this.notifier.paymentNotice(recorded.id, 'PAYMENT_CONFIRMATION', collectedById);
        return recorded;
      } catch (err) {
        const isReceiptCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isReceiptCollision && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
    // Unreachable — the loop above always either returns or throws.
    throw new Error('Could not record payment.');
  }

  // This is a school-wide report by nature (unlike listForStudent, it
  // has no single resourceId for the controller to run through
  // authorizeResource()) — so a caller whose fee.view grant is scoped to
  // OWN_CHILDREN (a Parent) must be filtered down here, or they would
  // see every family's outstanding balance in the school, not just
  // their own child's.
  async outstanding(auth: AuthContext, academicYearId?: string) {
    const studentFilter = await this.buildStudentFilter(auth);
    if (studentFilter === null) return [];

    const fees = await this.prisma.studentFee.findMany({
      where: {
        schoolId: auth.schoolId,
        deletedAt: null,
        status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIALLY_PAID] },
        ...studentFilter,
        ...(academicYearId ? { feeStructure: { academicYearId } } : {}),
      },
      include: { ...FEE_INCLUDE, student: true },
      orderBy: { dueDate: 'asc' },
    });

    const rules = await this.feeRules(auth.schoolId);
    return fees.map((fee) => ({
      ...this.toDto(fee, rules),
      student: {
        id: fee.student.id,
        admissionNo: fee.student.admissionNo,
        firstName: fee.student.firstName,
        lastName: fee.student.lastName,
      },
    }));
  }

  private async buildStudentFilter(auth: AuthContext): Promise<Prisma.StudentFeeWhereInput | null> {
    switch (auth.scope) {
      case 'ALL_SCHOOL':
        return {};

      case 'OWN_CHILDREN': {
        const parent = await this.prisma.parent.findFirst({
          where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
        });
        if (!parent) return null;
        const links = await this.prisma.studentParent.findMany({
          where: { schoolId: auth.schoolId, parentId: parent.id },
          select: { studentId: true },
        });
        if (!links.length) return null;
        return { studentId: { in: links.map((l) => l.studentId) } };
      }

      default:
        // No role is seeded with fee.view under any other scope — deny
        // rather than silently fall through to a school-wide report.
        return null;
    }
  }

  private toDto(fee: FeeWithRelations, rules: FeeRules) {
    const money = feeMoney(fee);
    const balanceMinor = money.balanceMinor;
    // Late fee is shown, not added: it never changes the amount billed or paid.
    // It accrues per day once the grace period after the due date has passed.
    let daysOverdue = 0;
    if (fee.dueDate && balanceMinor > 0 && fee.status !== StudentFeeStatus.WAIVED && fee.status !== StudentFeeStatus.PAID) {
      daysOverdue = Math.max(0, Math.round((new Date(rules.today).getTime() - new Date(dateOnlyToIso(fee.dueDate)).getTime()) / 86_400_000));
    }
    const daysLate = Math.max(0, daysOverdue - rules.graceDays);
    return {
      id: fee.id,
      studentId: fee.studentId,
      feeStructureId: fee.feeStructureId,
      amountDueMinor: fee.amountDueMinor,
      discountMinor: fee.discountMinor,
      netDueMinor: money.netDueMinor,
      dueDate: fee.dueDate,
      status: fee.status,
      paidMinor: money.paidMinor,
      refundedMinor: money.refundedMinor,
      balanceMinor,
      overdue: daysOverdue > 0,
      daysLate,
      lateFeeMinor: daysLate * rules.perDayMinor,
      feeCategory: { id: fee.feeStructure.feeCategory.id, name: fee.feeStructure.feeCategory.name },
      frequency: fee.feeStructure.frequency,
    };
  }
}
