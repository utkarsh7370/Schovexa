import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../authorization/authorization.types';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingScope } from './teaching-scope';

const EMPTY: ReadonlySet<string> = new Set();

@Injectable()
export class TeachingScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in person's teaching scope for the permission this request was authorised under. Resolved once per request. */
  async resolve(auth: AuthContext): Promise<TeachingScope> {
    if (auth.teaching) return auth.teaching;
    auth.teaching = await this.build(auth);
    return auth.teaching;
  }

  /**
   * "My own" teaching scope, whatever the permission grants: the sections and subjects I am assigned.
   * For the screens that are about the signed-in teacher's own day (dashboard, agenda), where a Principal
   * who holds ALL_SCHOOL rights should still see only what they themselves teach.
   */
  async resolveMine(auth: AuthContext): Promise<TeachingScope> {
    if (auth.teachingMine) return auth.teachingMine;
    auth.teachingMine = await this.forTeacher(auth);
    return auth.teachingMine;
  }

  private async build(auth: AuthContext): Promise<TeachingScope> {
    switch (auth.scope) {
      case 'ALL_SCHOOL': {
        // Sees everything — but may also be a teacher themselves (a Principal who takes a class).
        const own = await this.prisma.teacher.findFirst({ where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null }, select: { id: true } });
        return new TeachingScope('ALL', own?.id ?? null, EMPTY, EMPTY, EMPTY);
      }
      case 'OWN_CLASS':
      case 'OWN_SUBJECT':
      case 'OWN_STUDENTS':
        return this.forTeacher(auth);
      case 'OWN_CHILDREN':
        return this.forParent(auth);
      default:
        return new TeachingScope('NONE', null, EMPTY, EMPTY, EMPTY);
    }
  }

  private async forTeacher(auth: AuthContext): Promise<TeachingScope> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
      select: {
        id: true,
        classTeacherOf: { where: { deletedAt: null }, select: { id: true } },
        assignments: { where: { deletedAt: null, section: { deletedAt: null } }, select: { sectionId: true, subjectId: true } },
      },
    });
    if (!teacher) return new TeachingScope('TEACHER', null, EMPTY, EMPTY, EMPTY);
    const sections = new Set<string>([...teacher.classTeacherOf.map((s) => s.id), ...teacher.assignments.map((a) => a.sectionId)]);
    const pairs = new Set(teacher.assignments.map((a) => TeachingScope.key(a.sectionId, a.subjectId)));
    return new TeachingScope('TEACHER', teacher.id, sections, pairs, EMPTY);
  }

  private async forParent(auth: AuthContext): Promise<TeachingScope> {
    const parent = await this.prisma.parent.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
      select: { children: { select: { student: { select: { id: true, sectionId: true, deletedAt: true } } } } },
    });
    const children = (parent?.children ?? []).map((c) => c.student).filter((s) => !s.deletedAt);
    const sections = new Set(children.map((s) => s.sectionId).filter((id): id is string => !!id));
    return new TeachingScope('PARENT', null, sections, EMPTY, new Set(children.map((s) => s.id)));
  }

  /**
   * Which sections and classes a notice addressed to "a section" / "a class" would reach this person
   * through: the ones they teach in AND the ones their children are in (someone can be both).
   */
  async audienceOf(auth: AuthContext): Promise<{ sectionIds: string[]; classIds: string[] }> {
    const [teacher, parent] = await Promise.all([this.resolveMine(auth), this.forParent(auth)]);
    const sectionIds = [...new Set([...teacher.sectionIds, ...parent.sectionIds])];
    if (sectionIds.length === 0) return { sectionIds, classIds: [] };
    const sections = await this.prisma.section.findMany({ where: { id: { in: sectionIds }, schoolId: auth.schoolId }, select: { classId: true } });
    return { sectionIds, classIds: [...new Set(sections.map((x) => x.classId))] };
  }
}
