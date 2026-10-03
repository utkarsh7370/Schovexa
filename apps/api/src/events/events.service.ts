import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEventInput } from '@schovexa/validation';
import type { AuthContext } from '../authorization/authorization.types';
import { dateOnlyToIso } from '../common/dates.util';
import { PrismaService } from '../prisma/prisma.service';

// School events, staff meetings and parent-teacher meetings — dated things that aren't holidays or lessons.
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(e: { id: string; kind: string; title: string; startDate: Date; endDate: Date; startTime: string | null; endTime: string | null; location: string | null; description: string | null }) {
    return { id: e.id, kind: e.kind, title: e.title, startDate: dateOnlyToIso(e.startDate), endDate: dateOnlyToIso(e.endDate), startTime: e.startTime, endTime: e.endTime, location: e.location, description: e.description };
  }

  async list(auth: AuthContext, from?: string, to?: string) {
    const rows = await this.prisma.schoolEvent.findMany({
      where: { schoolId: auth.schoolId, deletedAt: null, ...(to ? { startDate: { lte: new Date(to) } } : {}), ...(from ? { endDate: { gte: new Date(from) } } : {}) },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      take: 500,
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(auth: AuthContext, input: CreateEventInput) {
    const row = await this.prisma.schoolEvent.create({
      data: { schoolId: auth.schoolId, kind: input.kind ?? 'EVENT', title: input.title, startDate: new Date(input.startDate), endDate: new Date(input.endDate ?? input.startDate), startTime: input.startTime || null, endTime: input.endTime || null, location: input.location || null, description: input.description || null, createdById: auth.userId },
    });
    return this.toDto(row);
  }

  async update(auth: AuthContext, id: string, input: Partial<CreateEventInput>) {
    const existing = await this.prisma.schoolEvent.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const row = await this.prisma.schoolEvent.update({
      where: { id },
      data: {
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime || null } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime || null } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    });
    return this.toDto(row);
  }

  async remove(auth: AuthContext, id: string) {
    const existing = await this.prisma.schoolEvent.findFirst({ where: { id, schoolId: auth.schoolId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    await this.prisma.schoolEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }
}
