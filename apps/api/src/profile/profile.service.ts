import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import type { UpdateProfileInput } from '@schovexa/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { dateOnlyToIso } from '../common/dates.util';

const nullable = (value: string | undefined) => (value === undefined ? undefined : value.trim() === '' ? null : value.trim());

// Everything about a person that is theirs to edit — never the password
// hash, never anything else on the row.
export function toProfileUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth ? dateOnlyToIso(user.dateOfBirth) : null,
    gender: user.gender,
    address: user.address,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    bio: user.bio,
    notifyByEmail: user.notifyByEmail,
    notifyInApp: user.notifyInApp,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };
}

const TEACHER_INCLUDE = {
  assignments: {
    where: { deletedAt: null },
    include: { section: { include: { class: true } }, subject: true },
    orderBy: { createdAt: 'asc' },
  },
  classTeacherOf: { where: { deletedAt: null }, include: { class: true } },
} satisfies Prisma.TeacherInclude;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async teacherDetail(schoolId: string, where: { userId: string } | { id: string }) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, deletedAt: null, ...where },
      include: TEACHER_INCLUDE,
    });
    if (!teacher) return null;
    return {
      id: teacher.id,
      employeeCode: teacher.employeeCode,
      joiningDate: teacher.joiningDate ? dateOnlyToIso(teacher.joiningDate) : null,
      assignments: teacher.assignments.map((a) => ({
        id: a.id,
        sectionId: a.sectionId,
        subjectId: a.subjectId,
        section: { id: a.section.id, name: a.section.name, class: { id: a.section.class.id, name: a.section.class.name } },
        subject: { id: a.subject.id, name: a.subject.name, code: a.subject.code },
      })),
      classTeacherOf: teacher.classTeacherOf.map((s) => ({ id: s.id, name: s.name, class: { id: s.class.id, name: s.class.name } })),
    };
  }

  private async documentCount(schoolId: string, userId: string) {
    return this.prisma.document.count({ where: { schoolId, ownerType: 'User', ownerId: userId, deletedAt: null } });
  }

  private async buildProfile(schoolId: string, membershipId: string) {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
      include: { user: true, role: true, school: true },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    const [teacher, documentCount] = await Promise.all([
      this.teacherDetail(schoolId, { userId: membership.userId }),
      this.documentCount(schoolId, membership.userId),
    ]);
    return {
      membershipId: membership.id,
      status: membership.status,
      joinedAt: membership.createdAt,
      role: { id: membership.role.id, name: membership.role.name },
      school: { id: membership.school.id, name: membership.school.name },
      user: toProfileUser(membership.user),
      teacher,
      documentCount,
    };
  }

  /** The signed-in person's own profile (their membership in the active school). */
  async getOwn(schoolId: string, membershipId: string) {
    return this.buildProfile(schoolId, membershipId);
  }

  /** Another staff member's profile, by membership id — callers authorize first. */
  async getStaff(schoolId: string, membershipId: string) {
    return this.buildProfile(schoolId, membershipId);
  }

  /** A teacher's profile, by teacher id — resolves the teacher's membership. */
  async getByTeacherId(schoolId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId, deletedAt: null } });
    const membership = teacher
      ? await this.prisma.schoolMembership.findFirst({
          where: { userId: teacher.userId, schoolId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return this.buildProfile(schoolId, membership.id);
  }

  async updateOwn(
    schoolId: string,
    membershipId: string,
    userId: string,
    input: UpdateProfileInput,
    meta: { ipAddress: string | null; userAgent: string | null },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: nullable(input.phone),
        dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: nullable(input.gender),
        address: nullable(input.address),
        emergencyContactName: nullable(input.emergencyContactName),
        emergencyContactPhone: nullable(input.emergencyContactPhone),
        bio: nullable(input.bio),
        ...(input.notifyByEmail !== undefined ? { notifyByEmail: input.notifyByEmail } : {}),
        ...(input.notifyInApp !== undefined ? { notifyInApp: input.notifyInApp } : {}),
      },
    });
    await this.audit.record({
      schoolId,
      userId,
      action: 'profile.update',
      module: 'profile',
      resourceType: 'User',
      resourceId: userId,
      ...meta,
    });
    return this.buildProfile(schoolId, membershipId);
  }

  // -- Documents -----------------------------------------------------------

  async listDocuments(schoolId: string, userId: string) {
    return this.prisma.document.findMany({
      where: { schoolId, ownerType: 'User', ownerId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A document owned by this user in this school — or a 404, never a hint it exists elsewhere. */
  async findDocument(schoolId: string, userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, schoolId, ownerType: 'User', ownerId: userId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return document;
  }

  /** The user id behind a staff membership in this school (404 for anything else). */
  async userIdForMembership(schoolId: string, membershipId: string): Promise<string> {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: { id: membershipId, schoolId, deletedAt: null },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return membership.userId;
  }
}
