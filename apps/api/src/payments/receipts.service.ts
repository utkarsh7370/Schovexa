import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../authorization/authorization.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { dateOnlyToIso } from '../common/dates.util';
import { FeeNotifierService } from '../finance/fee-notifier.service';
import { feeMoney } from '../finance/fee-math';
import { formatMoney } from '../finance/money';
import { PAYMENT_METHOD_LABELS } from '../finance/payment-methods';
import { PrismaService } from '../prisma/prisma.service';

const RECEIPT_INCLUDE = {
  payment: {
    include: {
      studentFee: {
        include: {
          student: { include: { section: { include: { class: true } }, parents: { include: { parent: true } } } },
          feeStructure: { include: { feeCategory: true } },
          payments: { where: { deletedAt: null } },
          refunds: { where: { status: 'PROCESSED' as const } },
        },
      },
    },
  },
} as const;

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

// Receipts: view, download as PDF, print and reprint, and re-send to the family.
// Anyone who can see the payment can see its receipt — staff with receipt.view
// (school-wide), and a parent for their own child's payments.
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly notifier: FeeNotifierService,
  ) {}

  /** Loads the receipt (404 across schools) and checks this person may see this student's payment. */
  private async load(auth: AuthContext, id: string) {
    const receipt = await this.prisma.receipt.findFirst({ where: { id, schoolId: auth.schoolId }, include: RECEIPT_INCLUDE });
    if (!receipt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.authorization.authorizeResource(auth, 'Student', receipt.payment.studentFee.studentId);
    return receipt;
  }

  async get(auth: AuthContext, id: string) {
    const receipt = await this.load(auth, id);
    const { payment } = receipt;
    const fee = payment.studentFee;
    const student = fee.student;
    const [school, cashier] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: auth.schoolId } }),
      this.prisma.user.findUnique({ where: { id: payment.collectedById }, select: { firstName: true, lastName: true } }),
    ]);
    const money = feeMoney(fee);
    const guardian = student.parents.map((l) => l.parent).find((p) => !p.deletedAt);
    return {
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      issuedAt: receipt.issuedAt,
      reprintCount: receipt.reprintCount,
      lastPrintedAt: receipt.lastPrintedAt,
      paymentId: payment.id,
      school: {
        name: school.name,
        address: [school.address, school.city, school.state, school.postalCode].filter(Boolean).join(', ') || null,
        phone: school.contactPhone,
        email: school.contactEmail,
        hasLogo: !!school.logoKey,
      },
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        admissionNo: student.admissionNo,
        className: student.section?.class.name ?? null,
        sectionName: student.section?.name ?? null,
        parentName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
      },
      fee: { category: fee.feeStructure.feeCategory.name, amountDueMinor: fee.amountDueMinor, discountMinor: fee.discountMinor, netDueMinor: money.netDueMinor },
      payment: {
        amountMinor: payment.amountMinor,
        method: payment.method,
        methodLabel: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference,
        receivedFrom: payment.receivedFrom,
        note: payment.note,
        collectedBy: cashier ? `${cashier.firstName} ${cashier.lastName}`.trim() : null,
        corrected: !!payment.correctedAt,
      },
      balanceMinor: money.balanceMinor,
      refundedMinor: money.refundedMinor,
    };
  }

  /** Printing (or re-printing) a receipt: counted, and written to the activity log. */
  async reprint(auth: AuthContext, id: string, meta: Meta) {
    const receipt = await this.load(auth, id);
    const updated = await this.prisma.receipt.update({ where: { id }, data: { reprintCount: { increment: 1 }, lastPrintedAt: new Date() } });
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'receipt.reprinted',
      module: 'receipt',
      resourceType: 'Receipt',
      resourceId: id,
      metadata: { receiptNo: receipt.receiptNo, copies: updated.reprintCount },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { reprintCount: updated.reprintCount, lastPrintedAt: updated.lastPrintedAt };
  }

  /** Sends the receipt to the family again (in-app and email). */
  async notify(auth: AuthContext, id: string, meta: Meta) {
    const receipt = await this.load(auth, id);
    const outcome = await this.notifier.paymentNotice(receipt.paymentId, 'RECEIPT', auth.userId);
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'receipt.sent',
      module: 'receipt',
      resourceType: 'Receipt',
      resourceId: id,
      metadata: { receiptNo: receipt.receiptNo, reached: outcome?.reached ?? 0 },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return outcome ?? { reached: 0, unreachable: 0, alreadyReminded: false };
  }

  /** The receipt as a PDF. (The built-in PDF font has no ₹ sign, so amounts read "Rs.".) */
  async pdf(auth: AuthContext, id: string, meta: Meta): Promise<{ buffer: Buffer; fileName: string }> {
    const r = await this.get(auth, id);
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'receipt.downloaded',
      module: 'receipt',
      resourceType: 'Receipt',
      resourceId: id,
      metadata: { receiptNo: r.receiptNo },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const rs = (minor: number) => formatMoney(minor).replace('₹', 'Rs. ');
    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${r.receiptNo}`, Author: r.school.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const width = doc.page.width - 72;
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0b1b3a').text(r.school.name, { align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
    if (r.school.address) doc.text(r.school.address, { align: 'center' });
    const contact = [r.school.phone, r.school.email].filter(Boolean).join('  ·  ');
    if (contact) doc.text(contact, { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(36, doc.y).lineTo(36 + width, doc.y).strokeColor('#cbd5e1').stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0b1b3a').text('FEE RECEIPT', { align: 'center' });
    doc.moveDown(0.5);
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(label, 36, y, { width: 110 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0b1b3a').text(value, 150, y, { width: width - 114 });
      doc.moveDown(0.35);
    };
    row('Receipt no.', r.receiptNo);
    row('Date', dateOnlyToIso(r.payment.paidAt));
    row('Student', r.student.name);
    row('Admission no.', r.student.admissionNo);
    if (r.student.className) row('Class', `${r.student.className}${r.student.sectionName ? ` – ${r.student.sectionName}` : ''}`);
    if (r.student.parentName) row('Parent / guardian', r.student.parentName);
    row('Fee', r.fee.category);
    if (r.fee.discountMinor > 0) row('Discount', rs(r.fee.discountMinor));
    row('Payment method', r.payment.methodLabel);
    if (r.payment.reference) row('Reference', r.payment.reference);
    if (r.payment.receivedFrom) row('Received from', r.payment.receivedFrom);
    if (r.payment.note) row('Note', r.payment.note);
    doc.moveDown(0.4);

    const boxY = doc.y;
    doc.roundedRect(36, boxY, width, 46, 6).fillAndStroke('#eff6ff', '#bfdbfe');
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Amount received', 48, boxY + 9);
    doc.fillColor('#0b1b3a').font('Helvetica-Bold').fontSize(18).text(rs(r.payment.amountMinor), 48, boxY + 21);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(r.balanceMinor > 0 ? `Balance on this fee: ${rs(r.balanceMinor)}` : 'Fee fully paid', 36, boxY + 18, { width: width - 12, align: 'right' });
    doc.y = boxY + 60;

    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
    if (r.payment.collectedBy) doc.text(`Received by ${r.payment.collectedBy}`, { align: 'left' });
    if (r.payment.corrected) doc.text('This payment was corrected after it was first recorded.');
    doc.moveDown(0.6);
    doc.text('This is a computer-generated receipt.', { align: 'center' });
    doc.end();

    return { buffer: await done, fileName: `receipt-${r.receiptNo.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf` };
  }
}
