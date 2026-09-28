import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignFeeToStudentInput, RecordPaymentInput, UpdateStudentFeeInput } from '@schovexa/validation';

const FEE_INCLUDE = { feeStructure: { include: { feeCategory: true } }, payments: true } as const;
type FeeWithRelations = Prisma.StudentFeeGetPayload<{ include: typeof FEE_INCLUDE }>;

@Injectable()
export class StudentFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForStudent(schoolId: string, studentId: string) {
    const fees = await this.prisma.studentFee.findMany({
      where: { schoolId, studentId, deletedAt: null },
      include: FEE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return fees.map((fee) => this.toDto(fee));
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
    return this.toDto(fee);
  }

  // A manual correction path (rare, pre-payment) — deliberately does not
  // recompute status the way recordPayment() does, since that's the one
  // real flow this needs to stay correct for.
  async update(schoolId: string, studentFeeId: string, input: UpdateStudentFeeInput) {
    const existing = await this.findForAuth(schoolId, studentFeeId);
    if (existing.status === StudentFeeStatus.WAIVED) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'This fee has been waived.' });
    }

    const fee = await this.prisma.studentFee.update({
      where: { id: studentFeeId },
      data: {
        ...(input.amountDueMinor !== undefined ? { amountDueMinor: input.amountDueMinor } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      },
      include: FEE_INCLUDE,
    });
    return this.toDto(fee);
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
    return this.toDto(fee);
  }

  async listPayments(schoolId: string, studentFeeId: string) {
    await this.findForAuth(schoolId, studentFeeId);
    return this.prisma.payment.findMany({
      where: { schoolId, studentFeeId, deletedAt: null },
      include: { receipt: true },
      orderBy: { paidAt: 'desc' },
    });
  }

  async recordPayment(schoolId: string, studentFeeId: string, collectedById: string, input: RecordPaymentInput) {
    const studentFee = await this.findForAuth(schoolId, studentFeeId);
    if (studentFee.status === StudentFeeStatus.WAIVED) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This fee has been waived; no payment can be recorded.',
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
        return await this.prisma.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              schoolId,
              studentFeeId,
              amountMinor: input.amountMinor,
              method: input.method,
              collectedById,
              paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
            },
          });

          const receiptCount = await tx.receipt.count({ where: { schoolId } });
          const receiptNo = String(receiptCount + 1).padStart(6, '0');
          await tx.receipt.create({ data: { schoolId, paymentId: payment.id, receiptNo } });

          const allPayments = await tx.payment.findMany({ where: { studentFeeId, deletedAt: null } });
          const totalPaidMinor = allPayments.reduce((sum, p) => sum + p.amountMinor, 0);
          const status =
            totalPaidMinor >= studentFee.amountDueMinor ? StudentFeeStatus.PAID : StudentFeeStatus.PARTIALLY_PAID;
          await tx.studentFee.update({ where: { id: studentFeeId }, data: { status } });

          return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { receipt: true } });
        });
      } catch (err) {
        const isReceiptCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isReceiptCollision && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
    // Unreachable — the loop above always either returns or throws.
    throw new Error('Could not record payment.');
  }

  async outstanding(schoolId: string, academicYearId?: string) {
    const fees = await this.prisma.studentFee.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: { in: [StudentFeeStatus.PENDING, StudentFeeStatus.PARTIALLY_PAID] },
        ...(academicYearId ? { feeStructure: { academicYearId } } : {}),
      },
      include: { ...FEE_INCLUDE, student: true },
      orderBy: { dueDate: 'asc' },
    });

    return fees.map((fee) => ({
      ...this.toDto(fee),
      student: {
        id: fee.student.id,
        admissionNo: fee.student.admissionNo,
        firstName: fee.student.firstName,
        lastName: fee.student.lastName,
      },
    }));
  }

  private toDto(fee: FeeWithRelations) {
    const paidMinor = fee.payments.reduce((sum, p) => sum + p.amountMinor, 0);
    return {
      id: fee.id,
      studentId: fee.studentId,
      feeStructureId: fee.feeStructureId,
      amountDueMinor: fee.amountDueMinor,
      dueDate: fee.dueDate,
      status: fee.status,
      paidMinor,
      balanceMinor: Math.max(fee.amountDueMinor - paidMinor, 0),
      feeCategory: { id: fee.feeStructure.feeCategory.id, name: fee.feeStructure.feeCategory.name },
      frequency: fee.feeStructure.frequency,
    };
  }
}
