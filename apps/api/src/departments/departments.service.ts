import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE = {
  headTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
  _count: { select: { teachers: { where: { deletedAt: null } }, subjects: { where: { deletedAt: null } } } },
} as const;

type Row = Awaited<ReturnType<DepartmentsService['findRow']>>;

function serialize(d: NonNullable<Row>) {
  return {
    id: d.id,
    name: d.name,
    code: d.code,
    description: d.description,
    headTeacher: d.headTeacher ? { id: d.headTeacher.id, name: `${d.headTeacher.user.firstName} ${d.headTeacher.user.lastName}`.trim() } : null,
    teacherCount: d._count.teachers,
    subjectCount: d._count.subjects,
  };
}

// Departments (Science, Languages, Sports…) group subjects and teachers.
// Removing one never deletes a subject or a teacher — they just become
// unassigned.
@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private findRow(schoolId: string, id: string) {
    return this.prisma.department.findFirst({ where: { id, schoolId, deletedAt: null }, include: INCLUDE });
  }

  async list(schoolId: string) {
    const rows = await this.prisma.department.findMany({
      where: { schoolId, deletedAt: null },
      include: INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(serialize);
  }

  async detail(schoolId: string, id: string) {
    const row = await this.findRow(schoolId, id);
    if (!row) throw this.notFound();
    const [teachers, subjects] = await Promise.all([
      this.prisma.teacher.findMany({ where: { schoolId, departmentId: id, deletedAt: null }, include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.subject.findMany({ where: { schoolId, departmentId: id, deletedAt: null }, orderBy: { name: 'asc' } }),
    ]);
    return {
      ...serialize(row),
      teachers: teachers.map((t) => ({ id: t.id, name: `${t.user.firstName} ${t.user.lastName}`.trim(), email: t.user.email })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
    };
  }

  async create(schoolId: string, input: CreateDepartmentInput) {
    await this.assertNameFree(schoolId, input.name);
    const headTeacherId = await this.resolveHead(schoolId, input.headTeacherId);
    const created = await this.prisma.department.create({
      data: { schoolId, name: input.name, code: input.code || null, description: input.description || null, headTeacherId },
    });
    return serialize((await this.findRow(schoolId, created.id))!);
  }

  async update(schoolId: string, id: string, input: UpdateDepartmentInput) {
    const existing = await this.findRow(schoolId, id);
    if (!existing) throw this.notFound();
    if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) await this.assertNameFree(schoolId, input.name);
    const headTeacherId = input.headTeacherId === undefined ? undefined : await this.resolveHead(schoolId, input.headTeacherId);
    await this.prisma.department.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code || null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(headTeacherId !== undefined ? { headTeacherId } : {}),
      },
    });
    return serialize((await this.findRow(schoolId, id))!);
  }

  async remove(schoolId: string, id: string) {
    if (!(await this.findRow(schoolId, id))) throw this.notFound();
    await this.prisma.$transaction([
      this.prisma.subject.updateMany({ where: { schoolId, departmentId: id }, data: { departmentId: null } }),
      this.prisma.teacher.updateMany({ where: { schoolId, departmentId: id }, data: { departmentId: null } }),
      this.prisma.department.update({ where: { id }, data: { deletedAt: new Date(), headTeacherId: null } }),
    ]);
    return { id };
  }

  /** A department id from a request body: '' clears it, anything else must be a live department of this school. */
  async resolveId(schoolId: string, departmentId: string | undefined): Promise<string | null | undefined> {
    if (departmentId === undefined) return undefined;
    if (departmentId === '') return null;
    const found = await this.prisma.department.findFirst({ where: { id: departmentId, schoolId, deletedAt: null }, select: { id: true } });
    if (!found) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown department.', details: [{ field: 'departmentId', message: 'Unknown department.' }] });
    return found.id;
  }

  private async resolveHead(schoolId: string, headTeacherId: string | undefined): Promise<string | null> {
    if (!headTeacherId) return null;
    const teacher = await this.prisma.teacher.findFirst({ where: { id: headTeacherId, schoolId, deletedAt: null }, select: { id: true } });
    if (!teacher) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Unknown teacher.', details: [{ field: 'headTeacherId', message: 'Unknown teacher.' }] });
    return teacher.id;
  }

  private async assertNameFree(schoolId: string, name: string) {
    const clash = await this.prisma.department.findFirst({ where: { schoolId, deletedAt: null, name: { equals: name, mode: 'insensitive' } } });
    if (clash) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A department with this name already exists.', details: [{ field: 'name', message: 'A department with this name already exists.' }] });
    }
  }

  private notFound() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
  }
}
