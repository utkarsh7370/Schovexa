import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const NOT_FOUND = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });

/** A filter that matches nothing — for someone whose scope covers no sections at all. */
const NOTHING = { in: [] as string[] };

/**
 * What one person may touch in teaching, resolved ONCE per request from their role's
 * permission scope and their teaching assignments (never from ids a client sends):
 *
 *   ALL_SCHOOL    everything in the school (Director, Principal, coordinator)
 *   OWN_CLASS /
 *   OWN_SUBJECT /
 *   OWN_STUDENTS  the sections they are class teacher of or teach in; "teaches" is
 *                 decided per (section, subject) pair, so teaching Maths in 6A never
 *                 opens English in 8B
 *   OWN_CHILDREN  a parent: the sections and students of their own children
 *   SELF          nothing here (the data is the person's own, handled by the caller)
 *
 * Services take this object and ask it questions; they never re-derive scope themselves.
 */
export class TeachingScope {
  constructor(
    readonly kind: 'ALL' | 'TEACHER' | 'PARENT' | 'NONE',
    readonly teacherId: string | null,
    /** Sections the person may see (class teacher of, or teaches in; a parent's children's). */
    readonly sectionIds: ReadonlySet<string>,
    /** "sectionId|subjectId" pairs the teacher is assigned. */
    private readonly pairs: ReadonlySet<string>,
    /** A parent's own children (empty otherwise). */
    readonly childIds: ReadonlySet<string>,
  ) {}

  static key(sectionId: string, subjectId: string): string {
    return `${sectionId}|${subjectId}`;
  }

  get all(): boolean {
    return this.kind === 'ALL';
  }

  canSeeSection(sectionId: string): boolean {
    return this.all || this.sectionIds.has(sectionId);
  }

  canTeach(sectionId: string, subjectId: string): boolean {
    return this.all || this.pairs.has(TeachingScope.key(sectionId, subjectId));
  }

  /** 404 (never 403) so an id from another class or school looks the same as one that doesn't exist. */
  assertSection(sectionId: string): void {
    if (!this.canSeeSection(sectionId)) throw NOT_FOUND();
  }

  assertTeaches(sectionId: string, subjectId: string): void {
    if (!this.canTeach(sectionId, subjectId)) throw NOT_FOUND();
  }

  canSeeStudent(student: { id: string; sectionId: string | null }): boolean {
    if (this.all) return true;
    if (this.kind === 'PARENT') return this.childIds.has(student.id);
    return !!student.sectionId && this.sectionIds.has(student.sectionId);
  }

  /** `where` fragment for any table with a sectionId column (timetable, attendance, papers…). */
  sectionWhere(): { sectionId?: { in: string[] } } {
    return this.all ? {} : { sectionId: this.sectionIds.size ? { in: [...this.sectionIds] } : NOTHING };
  }

  /** `where` fragment for students: everyone, a parent's children, or the students of the sections they teach. */
  studentWhere(): Prisma.StudentWhereInput {
    if (this.all) return {};
    if (this.kind === 'PARENT') return { id: this.childIds.size ? { in: [...this.childIds] } : NOTHING };
    return { sectionId: this.sectionIds.size ? { in: [...this.sectionIds] } : NOTHING };
  }

  /**
   * `where` fragment for tables carrying both sectionId and subjectId (coursework, papers, content):
   * a teacher sees only the subjects they are assigned in each section; a parent sees their
   * children's sections; ALL sees everything.
   */
  pairWhere(): { sectionId?: { in: string[] }; OR?: { sectionId: string; subjectId: string }[] } {
    if (this.all) return {};
    if (this.kind === 'PARENT') return this.sectionWhere();
    if (this.pairs.size === 0) return { sectionId: NOTHING };
    return { OR: [...this.pairs].map((p) => { const [sectionId, subjectId] = p.split('|'); return { sectionId, subjectId }; }) };
  }
}
