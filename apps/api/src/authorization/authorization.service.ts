import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext, ResourceType } from './authorization.types';

// Actions that are NOT blocked by the `readOnly` modifier. Everything
// else (create/update/delete/collect/publish/mark/refund/upload/
// disable/...) is treated as a mutation — docs/permissions.md §3,
// docs/authorization.md §3.
const READ_VERBS = new Set(['view']);

export interface RolePermissionGrant {
  scope: 'ALL_SCHOOL' | 'OWN_CLASS' | 'OWN_SUBJECT' | 'OWN_STUDENTS' | 'OWN_CHILDREN' | 'SELF';
  readOnly: boolean;
  action: string;
}

// The single reusable authorization surface every module calls into —
// docs/authorization.md §1. Two responsibilities, deliberately kept
// separate:
//   1. getGrant(): does this role have this permission at all, and with
//      what scope/readOnly? (called by PermissionGuard)
//   2. authorizeResource(): given a scope already resolved by the guard,
//      does this SPECIFIC resourceId actually fall within it? (called by
//      the handler/service, since only it knows which resourceId is in
//      play — docs/authorization.md §2)
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getGrant(roleId: string, permissionKey: string): Promise<RolePermissionGrant | null> {
    const permission = await this.prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) return null;

    const grant = await this.prisma.rolePermission.findFirst({
      where: { roleId, permissionId: permission.id },
    });
    if (!grant) return null;

    return { scope: grant.scope, readOnly: grant.readOnly, action: permission.action };
  }

  isMutationBlockedByReadOnly(grant: RolePermissionGrant): boolean {
    return grant.readOnly && !READ_VERBS.has(grant.action);
  }

  /**
   * Verifies `resourceId` actually falls within `auth.scope`
   * (docs/authorization.md §3). Throws NotFoundException (never
   * ForbiddenException) on a scope/tenant mismatch — a caller must not be
   * able to distinguish "wrong school" from "wrong scope" from "does not
   * exist" (docs/authorization.md §4, docs/multi-tenancy.md §4).
   */
  async authorizeResource(
    auth: AuthContext,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<void> {
    if (!auth.scope) {
      // A route protected by @RequirePermission but missing the
      // PermissionGuard (or called out of order) is a programming error,
      // not a tenant-isolation scenario — fail loudly, not as a 404.
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No permission scope resolved.' });
    }

    const allowed = await this.resolveScope(auth, auth.scope, resourceType, resourceId);
    if (!allowed) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
  }

  private async resolveScope(
    auth: AuthContext,
    scope: RolePermissionGrant['scope'],
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<boolean> {
    switch (scope) {
      case 'ALL_SCHOOL':
        return this.checkAllSchool(auth, resourceType, resourceId);
      case 'SELF':
        return this.checkSelf(auth, resourceType, resourceId);
      case 'OWN_CHILDREN':
        return this.checkOwnChildren(auth, resourceType, resourceId);
      case 'OWN_STUDENTS':
        return this.checkOwnStudents(auth, resourceType, resourceId);
      case 'OWN_CLASS':
        return this.checkOwnClass(auth, resourceType, resourceId);
      case 'OWN_SUBJECT':
        return this.checkOwnSubject(auth, resourceType, resourceId);
    }
  }

  // -- ALL_SCHOOL: resource exists, in this school, not soft-deleted ------

  private async checkAllSchool(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    switch (resourceType) {
      case 'Student': {
        const row = await this.prisma.student.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Class': {
        const row = await this.prisma.class.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Section': {
        const row = await this.prisma.section.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Subject': {
        const row = await this.prisma.subject.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Teacher': {
        const row = await this.prisma.teacher.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Parent': {
        const row = await this.prisma.parent.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'Document': {
        // A person's own documents (ID proof, certificates — ownerType
        // 'User') are personal data. They are reachable only through the
        // profile endpoints (me/documents, staff/:id/documents), which
        // check ownership or the staff permissions themselves — never
        // through the generic document.view route a Receptionist holds.
        const row = await this.prisma.document.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, ownerType: { not: 'User' }, deletedAt: null },
        });
        return !!row;
      }
      case 'Role': {
        const row = await this.prisma.role.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'AcademicYear': {
        const row = await this.prisma.academicYear.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'SchoolMembership': {
        const row = await this.prisma.schoolMembership.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
        });
        return !!row;
      }
      case 'User':
        // A bare User record has no schoolId of its own (it's a global
        // identity, docs/architecture.md §4) — ALL_SCHOOL has no
        // meaningful resolution against it. A permission granting
        // ALL_SCHOOL over a User-type resource is a configuration error,
        // not a real access pattern; treat as denied.
        return false;
    }
  }

  // -- SELF: the resource IS this user's own record ------------------------

  private async checkSelf(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    switch (resourceType) {
      case 'User':
        return resourceId === auth.userId;
      case 'Student': {
        const row = await this.prisma.student.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
        });
        return !!row;
      }
      case 'Parent': {
        const row = await this.prisma.parent.findFirst({
          where: { id: resourceId, schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
        });
        return !!row;
      }
      default:
        return false;
    }
  }

  // -- OWN_CHILDREN: resolved via StudentParent -----------------------------

  private async checkOwnChildren(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    if (resourceType !== 'Student') return false;

    const parentProfile = await this.prisma.parent.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
    });
    if (!parentProfile) return false;

    const link = await this.prisma.studentParent.findFirst({
      where: { schoolId: auth.schoolId, parentId: parentProfile.id, studentId: resourceId },
    });
    return !!link;
  }

  // -- OWN_STUDENTS: student's section is one this teacher owns -----------

  private async checkOwnStudents(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    if (resourceType !== 'Student') return false;

    const teacherProfile = await this.prisma.teacher.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
    });
    if (!teacherProfile) return false;

    const student = await this.prisma.student.findFirst({
      where: { id: resourceId, schoolId: auth.schoolId, deletedAt: null },
    });
    if (!student || !student.sectionId) return false;

    return this.teacherOwnsSection(teacherProfile.id, student.sectionId);
  }

  // -- OWN_CLASS: resolved via TeacherAssignment / Section.classTeacherId --

  private async checkOwnClass(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    if (resourceType !== 'Section') return false;

    const teacherProfile = await this.prisma.teacher.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
    });
    if (!teacherProfile) return false;

    return this.teacherOwnsSection(teacherProfile.id, resourceId);
  }

  private async teacherOwnsSection(teacherId: string, sectionId: string): Promise<boolean> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, deletedAt: null },
    });
    if (!section) return false;
    if (section.classTeacherId === teacherId) return true;

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { teacherId, sectionId, deletedAt: null },
    });
    return !!assignment;
  }

  // -- OWN_SUBJECT: resolved via TeacherAssignment -------------------------
  // MVP simplification (docs/authorization.md §3): checked independent of
  // section — "does this teacher teach this subject anywhere" — a
  // per-section-and-subject check applies once a module passes both ids.

  private async checkOwnSubject(auth: AuthContext, resourceType: ResourceType, resourceId: string) {
    if (resourceType !== 'Subject') return false;

    const teacherProfile = await this.prisma.teacher.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId, deletedAt: null },
    });
    if (!teacherProfile) return false;

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { teacherId: teacherProfile.id, subjectId: resourceId, deletedAt: null },
    });
    return !!assignment;
  }
}
