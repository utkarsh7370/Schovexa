import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { GroupKind } from '@prisma/client';
import type { AddGroupMembersInput, CreateGroupInput, UpdateGroupInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE = {
  leader: { include: { user: { select: { firstName: true, lastName: true } } } },
  _count: { select: { members: true } },
} as const;

type Row = Awaited<ReturnType<GroupsService['findRow']>>;

function serialize(g: NonNullable<Row>) {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    color: g.color,
    motto: g.motto,
    description: g.description,
    leader: g.leader ? { id: g.leader.id, name: `${g.leader.user.firstName} ${g.leader.user.lastName}`.trim() } : null,
    memberCount: g._count.members,
  };
}

// Houses, clubs and other student groups. A student is in at most one
// house; clubs, sports teams and other groups have no such limit.
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private findRow(schoolId: string, id: string) {
    return this.prisma.studentGroup.findFirst({ where: { id, schoolId, deletedAt: null }, include: INCLUDE });
  }

  async list(schoolId: string, kind?: string) {
    const rows = await this.prisma.studentGroup.findMany({
      where: { schoolId, deletedAt: null, ...(kind ? { kind: kind as GroupKind } : {}) },
      include: INCLUDE,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(serialize);
  }

  async detail(schoolId: string, id: string) {
    const row = await this.findRow(schoolId, id);
    if (!row) throw this.notFound();
    const members = await this.prisma.studentGroupMember.findMany({
      where: { schoolId, groupId: id, student: { deletedAt: null } },
      include: { student: { include: { section: { include: { class: true } } } } },
      orderBy: { student: { admissionNo: 'asc' } },
    });
    return {
      ...serialize(row),
      members: members.map((m) => ({
        studentId: m.studentId,
        admissionNo: m.student.admissionNo,
        name: `${m.student.firstName} ${m.student.lastName}`.trim(),
        className: m.student.section ? `${m.student.section.class.name} ${m.student.section.name}` : null,
      })),
    };
  }

  /** The houses and groups one student belongs to (for their profile). */
  async forStudent(schoolId: string, studentId: string) {
    const rows = await this.prisma.studentGroupMember.findMany({
      where: { schoolId, studentId, group: { deletedAt: null } },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });
    return rows.map((m) => ({ id: m.group.id, name: m.group.name, kind: m.group.kind, color: m.group.color }));
  }

  async create(schoolId: string, input: CreateGroupInput) {
    await this.assertNameFree(schoolId, input.name);
    const leaderTeacherId = await this.resolveLeader(schoolId, input.leaderTeacherId);
    const created = await this.prisma.studentGroup.create({
      data: {
        schoolId,
        name: input.name,
        kind: (input.kind ?? 'HOUSE') as GroupKind,
        color: input.color ?? '#2563eb',
        motto: input.motto || null,
        description: input.description || null,
        leaderTeacherId,
      },
    });
    return serialize((await this.findRow(schoolId, created.id))!);
  }

  async update(schoolId: string, id: string, input: UpdateGroupInput) {
    const existing = await this.findRow(schoolId, id);
    if (!existing) throw this.notFound();
    if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) await this.assertNameFree(schoolId, input.name);
    if (input.kind !== undefined && input.kind !== existing.kind && input.kind === 'HOUSE') {
      await this.assertNoHouseClash(schoolId, id);
    }
    const leaderTeacherId = input.leaderTeacherId === undefined ? undefined : await this.resolveLeader(schoolId, input.leaderTeacherId);
    await this.prisma.studentGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind as GroupKind } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.motto !== undefined ? { motto: input.motto || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(leaderTeacherId !== undefined ? { leaderTeacherId } : {}),
      },
    });
    return serialize((await this.findRow(schoolId, id))!);
  }

  async remove(schoolId: string, id: string) {
    if (!(await this.findRow(schoolId, id))) throw this.notFound();
    await this.prisma.$transaction([
      this.prisma.studentGroupMember.deleteMany({ where: { groupId: id } }),
      this.prisma.studentGroup.update({ where: { id }, data: { deletedAt: new Date(), leaderTeacherId: null } }),
    ]);
    return { id };
  }

  async addMembers(schoolId: string, id: string, input: AddGroupMembersInput) {
    const group = await this.findRow(schoolId, id);
    if (!group) throw this.notFound();
    const studentIds = [...new Set(input.studentIds)];
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (students.length !== studentIds.length) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'One or more students were not found in this school.' });
    }

    if (group.kind === 'HOUSE') {
      const elsewhere = await this.prisma.studentGroupMember.findMany({
        where: { schoolId, studentId: { in: studentIds }, groupId: { not: id }, group: { kind: 'HOUSE', deletedAt: null } },
        include: { group: true, student: true },
      });
      if (elsewhere.length > 0) {
        const first = elsewhere[0];
        throw new BadRequestException({
          code: 'ALREADY_IN_HOUSE',
          message: `${first.student.firstName} ${first.student.lastName} is already in ${first.group.name}. A student can be in only one house — remove them from it first.`,
        });
      }
    }

    const result = await this.prisma.studentGroupMember.createMany({
      data: studentIds.map((studentId) => ({ schoolId, groupId: id, studentId })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  async removeMember(schoolId: string, id: string, studentId: string) {
    if (!(await this.findRow(schoolId, id))) throw this.notFound();
    const result = await this.prisma.studentGroupMember.deleteMany({ where: { schoolId, groupId: id, studentId } });
    if (result.count === 0) throw this.notFound();
    return { studentId };
  }

  private async assertNoHouseClash(schoolId: string, groupId: string) {
    const members = await this.prisma.studentGroupMember.findMany({ where: { groupId }, select: { studentId: true } });
    if (members.length === 0) return;
    const clash = await this.prisma.studentGroupMember.findFirst({
      where: { schoolId, studentId: { in: members.map((m) => m.studentId) }, groupId: { not: groupId }, group: { kind: 'HOUSE', deletedAt: null } },
      include: { group: true },
    });
    if (clash) {
      throw new BadRequestException({ code: 'ALREADY_IN_HOUSE', message: `Some of these students are already in ${clash.group.name}, and a student can be in only one house.` });
    }
  }

  private async resolveLeader(schoolId: string, teacherId: string | undefined): Promise<string | null> {
    if (!teacherId) return null;
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId, deletedAt: null }, select: { id: true } });
    if (!teacher) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown teacher.', details: [{ field: 'leaderTeacherId', message: 'Unknown teacher.' }] });
    return teacher.id;
  }

  private async assertNameFree(schoolId: string, name: string) {
    const clash = await this.prisma.studentGroup.findFirst({ where: { schoolId, deletedAt: null, name: { equals: name, mode: 'insensitive' } } });
    if (clash) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A house or group with this name already exists.', details: [{ field: 'name', message: 'A house or group with this name already exists.' }] });
    }
  }

  private notFound() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
  }
}
