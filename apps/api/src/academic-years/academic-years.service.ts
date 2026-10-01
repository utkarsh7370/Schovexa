import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AcademicYear, AcademicYearReviewAction, AcademicYearStatus, Prisma } from '@prisma/client';
import type { CreateAcademicYearInput, UpdateAcademicYearInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayInTimezone } from '../common/dates.util';
import { isoDay } from './academic-year-rules';
import type { AuthContext } from '../authorization/authorization.types';

const PAGE = '/dashboard/academic-years';
// Statuses a year can still be "live" in — everything else is a closed chapter.
const OPEN_STATUSES: AcademicYearStatus[] = ['APPROVED', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'];

const fmtRange = (y: Pick<AcademicYear, 'startDate' | 'endDate'>) => `${isoDay(y.startDate)} to ${isoDay(y.endDate)}`;

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  // -- Expiry ---------------------------------------------------------------

  /**
   * Brings the school's years in line with today's date — idempotent, and
   * cheap enough to run every time years are read:
   *   1. any open year whose end date has passed becomes EXPIRED (and stops
   *      being "current"; a proposal that was never decided is simply moot);
   *   2. if no approved year is current, the approved year that covers today
   *      takes over.
   * "Today" is the school's own calendar day, not the server's.
   */
  async reconcile(schoolId: string): Promise<void> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
    const today = todayInTimezone(school?.timezone);

    const open = await this.prisma.academicYear.findMany({ where: { schoolId, deletedAt: null, status: { in: OPEN_STATUSES } } });

    const expired = open.filter((y) => isoDay(y.endDate) < today);
    if (expired.length > 0) {
      await this.prisma.$transaction([
        this.prisma.academicYear.updateMany({ where: { id: { in: expired.map((y) => y.id) } }, data: { status: 'EXPIRED', isCurrent: false } }),
        this.prisma.academicYearReview.createMany({
          data: expired.map((y) => ({ schoolId, academicYearId: y.id, action: 'EXPIRED' as AcademicYearReviewAction, note: `Ended on ${isoDay(y.endDate)}.` })),
        }),
      ]);
    }

    const expiredIds = new Set(expired.map((y) => y.id));
    const approved = open.filter((y) => y.status === 'APPROVED' && !expiredIds.has(y.id));
    if (!approved.some((y) => y.isCurrent)) {
      const covering = approved
        .filter((y) => isoDay(y.startDate) <= today && isoDay(y.endDate) >= today)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
      if (covering) {
        await this.prisma.academicYear.update({ where: { id: covering.id }, data: { isCurrent: true } });
      }
    }
  }

  // -- Reading ----------------------------------------------------------------

  private async toDtos(years: AcademicYear[]) {
    const userIds = [...new Set(years.flatMap((y) => [y.createdById, y.decidedById]).filter((id): id is string => !!id))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    const person = (id: string | null) => (id ? { id, name: nameOf.get(id) ?? 'Former user' } : null);
    return years.map((y) => ({
      id: y.id,
      name: y.name,
      startDate: y.startDate,
      endDate: y.endDate,
      isCurrent: y.isCurrent,
      status: y.status,
      createdBy: person(y.createdById),
      decidedBy: person(y.decidedById),
      decidedAt: y.decidedAt,
      decisionNote: y.decisionNote,
      createdAt: y.createdAt,
    }));
  }

  async list(schoolId: string) {
    await this.reconcile(schoolId);
    const years = await this.prisma.academicYear.findMany({ where: { schoolId, deletedAt: null }, orderBy: { startDate: 'desc' } });
    return this.toDtos(years);
  }

  /** What needs this person's attention: proposals to decide, or ones sent back to them. */
  async attention(auth: AuthContext) {
    await this.reconcile(auth.schoolId);
    const canApprove = !!(await this.authorization.getGrant(auth.roleId, 'academicYear.approve'));
    const [awaiting, revise] = await Promise.all([
      canApprove
        ? this.prisma.academicYear.findMany({ where: { schoolId: auth.schoolId, deletedAt: null, status: 'PENDING_APPROVAL' }, orderBy: { createdAt: 'asc' } })
        : Promise.resolve([]),
      this.prisma.academicYear.findMany({
        where: { schoolId: auth.schoolId, deletedAt: null, status: 'CHANGES_REQUESTED', createdById: auth.userId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const [awaitingApproval, needsRevision] = await Promise.all([this.toDtos(awaiting), this.toDtos(revise)]);
    return { awaitingApproval, needsRevision };
  }

  async reviews(schoolId: string, id: string) {
    await this.findYear(schoolId, id);
    const rows = await this.prisma.academicYearReview.findMany({ where: { schoolId, academicYearId: id }, orderBy: { createdAt: 'asc' } });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((a): a is string => !!a))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } } }) : [];
    const nameOf = new Map(actors.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      note: r.note,
      createdAt: r.createdAt,
      actor: r.actorId ? { id: r.actorId, name: nameOf.get(r.actorId) ?? 'Former user' } : null,
    }));
  }

  private async findYear(schoolId: string, id: string): Promise<AcademicYear> {
    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!year) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return year;
  }

  // -- Proposing and editing -------------------------------------------------

  private async assertDatesAndUniqueness(
    schoolId: string,
    candidate: { name: string; startDate: string; endDate: string },
    excludeId?: string,
  ): Promise<void> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
    if (candidate.endDate < todayInTimezone(school?.timezone)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'That period has already ended. Choose dates that are still ahead.' });
    }

    const others = await this.prisma.academicYear.findMany({
      where: { schoolId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    // Names are unique per school (a database rule), rejected proposals included —
    // their history stays on record, so a new attempt needs its own name.
    const sameName = others.find((y) => y.name.toLowerCase() === candidate.name.toLowerCase());
    if (sameName) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message:
          sameName.status === 'REJECTED'
            ? `A proposal called ${sameName.name} was rejected earlier. Give this one a new name, like ${sameName.name} (revised).`
            : 'An academic year with this name already exists.',
      });
    }
    const clash = others.find((y) => OPEN_STATUSES.includes(y.status) && isoDay(y.startDate) <= candidate.endDate && isoDay(y.endDate) >= candidate.startDate);
    if (clash) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `These dates overlap with ${clash.name} (${fmtRange(clash)}).`,
      });
    }
  }

  async create(auth: AuthContext, input: CreateAcademicYearInput) {
    const name = input.name.trim();
    await this.assertDatesAndUniqueness(auth.schoolId, { name, startDate: input.startDate, endDate: input.endDate });

    const canApprove = !!(await this.authorization.getGrant(auth.roleId, 'academicYear.approve'));
    const hasCurrent = (await this.prisma.academicYear.count({ where: { schoolId: auth.schoolId, deletedAt: null, status: 'APPROVED', isCurrent: true } })) > 0;

    const year = await this.prisma.academicYear.create({
      data: {
        schoolId: auth.schoolId,
        name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        createdById: auth.userId,
        // Whoever can approve a year doesn't need to ask themselves for approval.
        status: canApprove ? 'APPROVED' : 'PENDING_APPROVAL',
        isCurrent: canApprove && !hasCurrent,
        ...(canApprove ? { decidedById: auth.userId, decidedAt: new Date() } : {}),
      },
    });

    await this.addReview(auth, year.id, canApprove ? 'APPROVED' : 'SUBMITTED', canApprove ? 'Created and approved by the Director.' : undefined);
    await this.record(auth, canApprove ? 'academic_year.create_approved' : 'academic_year.propose', year);
    if (!canApprove) await this.notifyApprovers(auth, year, 'proposed');
    return (await this.toDtos([year]))[0];
  }

  async update(auth: AuthContext, id: string, input: UpdateAcademicYearInput) {
    const year = await this.findYear(auth.schoolId, id);
    if (year.status !== 'PENDING_APPROVAL' && year.status !== 'CHANGES_REQUESTED') {
      throw new BadRequestException({ code: 'ACADEMIC_YEAR_LOCKED', message: 'Only a year that is still waiting for approval can be edited.' });
    }
    const next = {
      name: (input.name ?? year.name).trim(),
      startDate: input.startDate ?? isoDay(year.startDate),
      endDate: input.endDate ?? isoDay(year.endDate),
    };
    if (next.endDate <= next.startDate) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The end date must be after the start date.' });
    }
    await this.assertDatesAndUniqueness(auth.schoolId, next, id);

    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { name: next.name, startDate: new Date(next.startDate), endDate: new Date(next.endDate) },
    });
    await this.record(auth, 'academic_year.update', updated);
    return (await this.toDtos([updated]))[0];
  }

  async resubmit(auth: AuthContext, id: string, note?: string) {
    const year = await this.findYear(auth.schoolId, id);
    if (year.status !== 'CHANGES_REQUESTED') {
      throw new BadRequestException({ code: 'ACADEMIC_YEAR_LOCKED', message: 'Only a year the Director sent back can be resubmitted.' });
    }
    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL', decidedById: null, decidedAt: null, decisionNote: null },
    });
    await this.addReview(auth, id, 'RESUBMITTED', note);
    await this.record(auth, 'academic_year.resubmit', updated);
    await this.notifyApprovers(auth, updated, 'resubmitted');
    return (await this.toDtos([updated]))[0];
  }

  // -- The Director's decision -----------------------------------------------

  private async pendingYear(schoolId: string, id: string): Promise<AcademicYear> {
    const year = await this.findYear(schoolId, id);
    if (year.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException({ code: 'ACADEMIC_YEAR_LOCKED', message: 'This year isn’t waiting for a decision.' });
    }
    return year;
  }

  async approve(auth: AuthContext, id: string, note?: string) {
    await this.reconcile(auth.schoolId); // a proposal whose dates have passed is already EXPIRED
    const year = await this.pendingYear(auth.schoolId, id);
    const hasCurrent = (await this.prisma.academicYear.count({ where: { schoolId: auth.schoolId, deletedAt: null, status: 'APPROVED', isCurrent: true } })) > 0;
    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { status: 'APPROVED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note?.trim() || null, isCurrent: !hasCurrent },
    });
    await this.addReview(auth, id, 'APPROVED', note);
    await this.record(auth, 'academic_year.approve', updated);
    await this.notifyProposer(auth, year, `${year.name} was approved`, note ? `The Director approved it: “${note.trim()}”` : 'The Director approved it. You can now add classes and fees to it.');
    return (await this.toDtos([updated]))[0];
  }

  async reject(auth: AuthContext, id: string, note: string) {
    await this.reconcile(auth.schoolId);
    const year = await this.pendingYear(auth.schoolId, id);
    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { status: 'REJECTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note.trim() },
    });
    await this.addReview(auth, id, 'REJECTED', note);
    await this.record(auth, 'academic_year.reject', updated);
    await this.notifyProposer(auth, year, `${year.name} was rejected`, `The Director rejected it: “${note.trim()}”`);
    return (await this.toDtos([updated]))[0];
  }

  async requestChanges(auth: AuthContext, id: string, note: string) {
    await this.reconcile(auth.schoolId);
    const year = await this.pendingYear(auth.schoolId, id);
    const updated = await this.prisma.academicYear.update({
      where: { id },
      data: { status: 'CHANGES_REQUESTED', decidedById: auth.userId, decidedAt: new Date(), decisionNote: note.trim() },
    });
    await this.addReview(auth, id, 'CHANGES_REQUESTED', note);
    await this.record(auth, 'academic_year.request_changes', updated);
    await this.notifyProposer(auth, year, `Changes suggested for ${year.name}`, `The Director suggests: “${note.trim()}”. Edit the year and resubmit it.`);
    return (await this.toDtos([updated]))[0];
  }

  // -- Current year -------------------------------------------------------------

  async setCurrent(schoolId: string, academicYearId: string) {
    await this.reconcile(schoolId);
    const year = await this.findYear(schoolId, academicYearId);
    if (year.status !== 'APPROVED') {
      throw new BadRequestException({
        code: 'ACADEMIC_YEAR_NOT_APPROVED',
        message: year.status === 'EXPIRED' ? `${year.name} has ended and can’t be made current.` : `${year.name} needs the Director’s approval before it can be current.`,
      });
    }

    await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } }),
      this.prisma.academicYear.update({ where: { id: academicYearId }, data: { isCurrent: true } }),
    ]);
    return (await this.toDtos([await this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } })]))[0];
  }

  // -- Helpers ---------------------------------------------------------------------

  private async addReview(auth: AuthContext, academicYearId: string, action: AcademicYearReviewAction, note?: string) {
    await this.prisma.academicYearReview.create({
      data: { schoolId: auth.schoolId, academicYearId, action, note: note?.trim() || null, actorId: auth.userId },
    });
  }

  private async record(auth: AuthContext, action: string, year: AcademicYear) {
    await this.audit.record({
      schoolId: auth.schoolId,
      userId: auth.userId,
      action,
      module: 'academic-years',
      resourceType: 'AcademicYear',
      resourceId: year.id,
      metadata: { name: year.name, status: year.status } satisfies Prisma.InputJsonValue,
    });
  }

  private async actorName(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? `${user.firstName} ${user.lastName}`.trim() : 'Someone';
  }

  /** Tell everyone who can approve (the Director) that a year is waiting — in the app and, when SMTP is set up, by email. */
  private async notifyApprovers(auth: AuthContext, year: AcademicYear, kind: 'proposed' | 'resubmitted') {
    const approvers = (await this.notifications.usersWithPermission(auth.schoolId, 'academicYear.approve')).filter((u) => u.id !== auth.userId);
    const who = await this.actorName(auth.userId);
    const title = kind === 'proposed' ? `Academic year ${year.name} needs your approval` : `${year.name} was resubmitted for approval`;
    const body = `${who} ${kind === 'proposed' ? 'proposed' : 'resubmitted'} ${year.name} (${fmtRange(year)}). Review it, then approve, reject or suggest changes.`;
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: approvers.map((u) => u.id), title, body, link: PAGE });
    for (const approver of approvers) {
      void this.email.send({
        to: approver.email,
        subject: `[Schovexa] ${title}`,
        text: `${body}\n\nOpen Academic Years in your dashboard to decide.`,
        html: `<p>${body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)}</p><p>Open <strong>Academic Years</strong> in your dashboard to decide.</p>`,
      });
    }
  }

  private async notifyProposer(auth: AuthContext, year: AcademicYear, title: string, body: string) {
    if (!year.createdById || year.createdById === auth.userId) return;
    await this.notifications.notify({ schoolId: auth.schoolId, userIds: [year.createdById], title, body, link: PAGE });
  }
}
