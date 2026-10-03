import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateSubstitutionInput, CreateTimetableSlotInput, UpdateTimetableSlotInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso } from '../common/dates.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolClockService } from '../teaching/school-clock.service';
import { TeachingScopeService } from '../teaching/teaching-scope.service';

const SLOT_INCLUDE = {
  section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.TimetableSlotInclude;
type Slot = Prisma.TimetableSlotGetPayload<{ include: typeof SLOT_INCLUDE }>;

const teacherName = (t: { user: { firstName: string; lastName: string } }) => `${t.user.firstName} ${t.user.lastName}`.trim();

export interface Lesson {
  slotId: string;
  period: number;
  startTime: string;
  endTime: string;
  room: string | null;
  section: { id: string; name: string };
  subject: { id: string; name: string };
  /** OWN: yours as timetabled · COVER: you are standing in · COVERED: yours, but someone else takes it today. */
  kind: 'OWN' | 'COVER' | 'COVERED';
  otherTeacher: string | null;
  reason: string | null;
}

// The master timetable (who teaches what to whom, when) and the day-by-day substitutions on top of it.
// Reading follows the caller's scope; changing it is a school-wide administrative right (timetable.manage).
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: TeachingScopeService,
    private readonly clock: SchoolClockService,
    private readonly notifications: NotificationsService,
  ) {}

  private toDto(s: Slot) {
    return {
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      section: { id: s.section.id, name: `${s.section.class.name} – ${s.section.name}` },
      subject: s.subject,
      teacher: { id: s.teacher.id, name: teacherName(s.teacher) },
    };
  }

  async list(auth: AuthContext, filters: { sectionId?: string; teacherId?: string; mine?: boolean }) {
    const scope = await this.scopeService.resolve(auth);
    if (filters.sectionId) scope.assertSection(filters.sectionId);
    const teacherId = filters.mine ? (scope.teacherId ?? '__none__') : filters.teacherId;
    const slots = await this.prisma.timetableSlot.findMany({
      where: { schoolId: auth.schoolId, ...scope.sectionWhere(), ...(filters.sectionId ? { sectionId: filters.sectionId } : {}), ...(teacherId ? { teacherId } : {}) },
      include: SLOT_INCLUDE,
      orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
    });
    return slots.map((s) => this.toDto(s));
  }

  /**
   * One teacher's lessons on one date, substitutions applied. Shared by the "today" screen and the
   * dashboard so they can never disagree.
   */
  async lessonsFor(schoolId: string, teacherId: string, date: string): Promise<Lesson[]> {
    const day = new Date(date);
    const slots = await this.prisma.timetableSlot.findMany({
      where: {
        schoolId,
        dayOfWeek: SchoolClockService.weekday(date),
        OR: [{ teacherId }, { substitutions: { some: { date: day, substituteTeacherId: teacherId } } }],
      },
      include: { ...SLOT_INCLUDE, substitutions: { where: { date: day }, include: { substituteTeacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } } } },
      orderBy: { period: 'asc' },
    });
    return slots.map((s): Lesson => {
      const sub = s.substitutions[0];
      const base = { slotId: s.id, period: s.period, startTime: s.startTime, endTime: s.endTime, room: s.room, section: { id: s.section.id, name: `${s.section.class.name} – ${s.section.name}` }, subject: s.subject };
      if (sub && sub.substituteTeacherId === teacherId) return { ...base, kind: 'COVER', otherTeacher: teacherName(s.teacher), reason: sub.reason };
      if (sub) return { ...base, kind: 'COVERED', otherTeacher: teacherName(sub.substituteTeacher), reason: sub.reason };
      return { ...base, kind: 'OWN', otherTeacher: null, reason: null };
    });
  }

  /** The signed-in teacher's schedule for a date (default: the school's today). */
  async mySchedule(auth: AuthContext, dateInput?: string) {
    const scope = await this.scopeService.resolve(auth);
    const date = dateInput ?? (await this.clock.today(auth.schoolId));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Use a date like 2026-10-01.' });
    return { date, lessons: scope.teacherId ? await this.lessonsFor(auth.schoolId, scope.teacherId, date) : [] };
  }

  // -- Administration -------------------------------------------------------------

  private async validate(schoolId: string, v: { sectionId: string; subjectId: string; teacherId: string }) {
    const [assignment, teacher] = await Promise.all([
      this.prisma.teacherAssignment.findFirst({ where: { schoolId, teacherId: v.teacherId, sectionId: v.sectionId, subjectId: v.subjectId, deletedAt: null } }),
      this.prisma.teacher.findFirst({ where: { id: v.teacherId, schoolId, deletedAt: null } }),
    ]);
    if (!teacher) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown teacher.' });
    if (!assignment) {
      throw new BadRequestException({ code: 'NOT_ASSIGNED', message: 'That teacher isn’t assigned to teach this subject in this section. Assign them first on the Teachers page.' });
    }
  }

  private conflict(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      throw new ConflictException({
        code: 'TIMETABLE_CONFLICT',
        message: target.includes('teacherId') ? 'That teacher already has a lesson in this period.' : 'This section already has a lesson in this period.',
      });
    }
    throw err;
  }

  async create(auth: AuthContext, input: CreateTimetableSlotInput) {
    await this.validate(auth.schoolId, input);
    try {
      const slot = await this.prisma.timetableSlot.create({ data: { schoolId: auth.schoolId, ...input, room: input.room || null }, include: SLOT_INCLUDE });
      await this.tell(auth, slot, 'added to');
      return this.toDto(slot);
    } catch (err) {
      return this.conflict(err);
    }
  }

  async update(auth: AuthContext, id: string, input: UpdateTimetableSlotInput) {
    const existing = await this.prisma.timetableSlot.findFirst({ where: { id, schoolId: auth.schoolId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const merged = { sectionId: input.sectionId ?? existing.sectionId, subjectId: input.subjectId ?? existing.subjectId, teacherId: input.teacherId ?? existing.teacherId };
    await this.validate(auth.schoolId, merged);
    try {
      const slot = await this.prisma.timetableSlot.update({ where: { id }, data: { ...input, ...(input.room !== undefined ? { room: input.room || null } : {}) }, include: SLOT_INCLUDE });
      await this.tell(auth, slot, 'changed in');
      if (existing.teacherId !== slot.teacherId) {
        const previous = await this.prisma.teacher.findUnique({ where: { id: existing.teacherId }, select: { userId: true } });
        if (previous) await this.notifications.notify({ schoolId: auth.schoolId, userIds: [previous.userId], title: 'Timetable changed', body: `You no longer teach ${slot.subject.name} to ${slot.section.class.name} – ${slot.section.name} on ${DAY_NAMES[slot.dayOfWeek]} period ${slot.period}.`, link: '/dashboard/timetable' });
      }
      return this.toDto(slot);
    } catch (err) {
      return this.conflict(err);
    }
  }

  async remove(auth: AuthContext, id: string) {
    const slot = await this.prisma.timetableSlot.findFirst({ where: { id, schoolId: auth.schoolId }, include: SLOT_INCLUDE });
    if (!slot) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.prisma.timetableSlot.delete({ where: { id } });
    await this.tell(auth, slot, 'removed from');
    return { id };
  }

  private async tell(auth: AuthContext, slot: Slot, verb: string) {
    await this.notifications.notify({
      schoolId: auth.schoolId,
      userIds: [slot.teacher.userId],
      title: 'Timetable changed',
      body: `${slot.subject.name} for ${slot.section.class.name} – ${slot.section.name} was ${verb} your timetable: ${DAY_NAMES[slot.dayOfWeek]}, period ${slot.period} (${slot.startTime}–${slot.endTime}).`,
      link: '/dashboard/timetable',
    });
  }

  // -- Substitutions --------------------------------------------------------------

  async listSubstitutions(auth: AuthContext, from: string, to: string) {
    const scope = await this.scopeService.resolve(auth);
    const rows = await this.prisma.timetableSubstitution.findMany({
      where: {
        schoolId: auth.schoolId,
        date: { gte: new Date(from), lte: new Date(to) },
        // A teacher sees cover that involves them (either side); an administrator sees all.
        ...(scope.all ? {} : { OR: [{ substituteTeacherId: scope.teacherId ?? '__none__' }, { slot: { teacherId: scope.teacherId ?? '__none__' } }] }),
      },
      include: { slot: { include: SLOT_INCLUDE }, substituteTeacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      date: dateOnlyToIso(r.date),
      reason: r.reason,
      slot: this.toDto(r.slot),
      substitute: { id: r.substituteTeacher.id, name: teacherName(r.substituteTeacher) },
    }));
  }

  async createSubstitution(auth: AuthContext, input: CreateSubstitutionInput) {
    const slot = await this.prisma.timetableSlot.findFirst({ where: { id: input.slotId, schoolId: auth.schoolId }, include: SLOT_INCLUDE });
    if (!slot) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    if (SchoolClockService.weekday(input.date) !== slot.dayOfWeek) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `This lesson is on ${DAY_NAMES[slot.dayOfWeek]}s, and ${input.date} isn’t one.` });
    }
    if (input.substituteTeacherId === slot.teacherId) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The substitute is the teacher already taking the lesson.' });
    const substitute = await this.prisma.teacher.findFirst({ where: { id: input.substituteTeacherId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true, userId: true } });
    if (!substitute) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown teacher.' });
    // The cover teacher must be free that period, that day.
    const busy = await this.prisma.timetableSlot.findFirst({ where: { schoolId: auth.schoolId, teacherId: substitute.id, dayOfWeek: slot.dayOfWeek, period: slot.period, substitutions: { none: { date: new Date(input.date) } } } });
    if (busy) throw new ConflictException({ code: 'TIMETABLE_CONFLICT', message: 'That teacher has a lesson in this period.' });
    try {
      const row = await this.prisma.timetableSubstitution.create({ data: { schoolId: auth.schoolId, slotId: slot.id, date: new Date(input.date), substituteTeacherId: substitute.id, reason: input.reason || null, createdById: auth.userId } });
      const what = `${slot.subject.name}, ${slot.section.class.name} – ${slot.section.name}, period ${slot.period} on ${input.date}`;
      await this.notifications.notify({ schoolId: auth.schoolId, userIds: [substitute.userId], title: 'You are covering a lesson', body: `${what}${input.reason ? ` (${input.reason})` : ''}.`, link: '/dashboard/timetable' });
      await this.notifications.notify({ schoolId: auth.schoolId, userIds: [slot.teacher.userId], title: 'Your lesson is covered', body: `${what} will be taken by someone else.`, link: '/dashboard/timetable' });
      return { id: row.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_COVERED', message: 'This lesson already has a substitute on that date.' });
      }
      throw err;
    }
  }

  async removeSubstitution(auth: AuthContext, id: string) {
    const row = await this.prisma.timetableSubstitution.findFirst({ where: { id, schoolId: auth.schoolId } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.prisma.timetableSubstitution.delete({ where: { id } });
    return { id };
  }
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
