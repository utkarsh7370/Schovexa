import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Who to tell: the people behind a class, a student, or a teaching assignment. Names only — never contact details. */
@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Portal users who are parents of the given students (or of everyone in the section). */
  async parentUserIds(schoolId: string, target: { sectionId?: string; studentIds?: string[] }): Promise<string[]> {
    const links = await this.prisma.studentParent.findMany({
      where: {
        schoolId,
        parent: { userId: { not: null }, deletedAt: null },
        student: { deletedAt: null, ...(target.studentIds?.length ? { id: { in: target.studentIds } } : target.sectionId ? { sectionId: target.sectionId } : { id: '__none__' }) },
      },
      select: { parent: { select: { userId: true } } },
    });
    return [...new Set(links.map((l) => l.parent.userId).filter((id): id is string => !!id))];
  }

  /** The teachers of a section — its class teacher and everyone assigned to teach in it (optionally one subject). */
  async teacherUserIds(schoolId: string, sectionId: string, subjectId?: string): Promise<{ userId: string; teacherId: string }[]> {
    const [section, assignments] = await Promise.all([
      this.prisma.section.findFirst({ where: { id: sectionId, schoolId, deletedAt: null }, select: { classTeacher: { select: { id: true, userId: true } } } }),
      this.prisma.teacherAssignment.findMany({ where: { schoolId, sectionId, deletedAt: null, ...(subjectId ? { subjectId } : {}) }, select: { teacher: { select: { id: true, userId: true, deletedAt: true } } } }),
    ]);
    const found = new Map<string, { userId: string; teacherId: string }>();
    if (section?.classTeacher && !subjectId) found.set(section.classTeacher.id, { userId: section.classTeacher.userId, teacherId: section.classTeacher.id });
    for (const a of assignments) if (!a.teacher.deletedAt) found.set(a.teacher.id, { userId: a.teacher.userId, teacherId: a.teacher.id });
    return [...found.values()];
  }
}
