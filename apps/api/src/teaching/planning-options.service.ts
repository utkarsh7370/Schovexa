import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Everything a coordinator needs to plan the timetable and exam papers: the whole school's sections,
 * subjects and teachers, who teaches what, and the academic years. Unlike `/teaching/options` this is not
 * limited to one teacher's own classes.
 */
@Injectable()
export class PlanningOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async load(schoolId: string) {
    const [assignments, years] = await Promise.all([
      this.prisma.teacherAssignment.findMany({
        where: { schoolId, deletedAt: null, section: { deletedAt: null }, subject: { deletedAt: null }, teacher: { deletedAt: null } },
        select: {
          sectionId: true,
          subjectId: true,
          teacherId: true,
          section: { select: { id: true, name: true, classId: true, class: { select: { name: true, order: true } } } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.academicYear.findMany({ where: { schoolId, deletedAt: null, status: 'APPROVED' }, orderBy: { startDate: 'desc' }, select: { id: true, name: true, isCurrent: true } }),
    ]);
    const sections = new Map<string, { id: string; name: string; classId: string; className: string; order: number }>();
    const subjects = new Map<string, { id: string; name: string }>();
    const teachers = new Map<string, { id: string; name: string }>();
    for (const a of assignments) {
      sections.set(a.section.id, { id: a.section.id, name: `${a.section.class.name} – ${a.section.name}`, classId: a.section.classId, className: a.section.class.name, order: a.section.class.order });
      subjects.set(a.subject.id, a.subject);
      teachers.set(a.teacher.id, { id: a.teacher.id, name: `${a.teacher.user.firstName} ${a.teacher.user.lastName}` });
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
    return {
      sections: [...sections.values()].sort((a, b) => a.order - b.order || byName(a, b)).map((s) => ({ id: s.id, name: s.name, classId: s.classId, className: s.className })),
      subjects: [...subjects.values()].sort(byName),
      teachers: [...teachers.values()].sort(byName),
      assignments: assignments.map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId })),
      academicYears: years,
    };
  }
}
