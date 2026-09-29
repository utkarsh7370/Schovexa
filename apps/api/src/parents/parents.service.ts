import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, RequestMeta } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import type { CreateParentInput, InviteParentInput } from '@schovexa/validation';

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  // Linked children ride along so the list and the profile can show who
  // each parent is responsible for without a request per parent.
  // Soft-deleted students are filtered out of the link list.
  private readonly childrenInclude = {
    children: {
      where: { student: { deletedAt: null } },
      orderBy: { isPrimary: 'desc' as const },
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            status: true,
            section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
          },
        },
      },
    },
  };

  async list(schoolId: string) {
    return this.prisma.parent.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: this.childrenInclude,
    });
  }

  async findOne(schoolId: string, parentId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, schoolId, deletedAt: null },
      include: this.childrenInclude,
    });
    if (!parent) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return parent;
  }

  // A Parent profile is a standalone contact record (firstName/lastName/
  // phone/email of its own) — it does NOT require an existing portal
  // User, unlike a Teacher profile. Most schools record parent contact
  // details without ever giving every parent a login; Parent.userId
  // (nullable, docs/database.md §5) stays unset until `invite()` below
  // links one.
  async create(schoolId: string, input: CreateParentInput) {
    return this.prisma.parent.create({
      data: {
        schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
        email: input.email || null,
      },
    });
  }

  /**
   * Links this Parent record to a portal login. Reuses the exact same
   * invite mechanism the Staff flow uses (AuthService.createInvitation) —
   * find-or-create the User by email, find-or-reactivate the
   * SchoolMembership, issue an INVITE token — rather than a parallel
   * implementation.
   *
   * A parent of two children at this school has two separate Parent
   * rows (one created alongside each admission). If both share an
   * email, this must collapse onto a single Parent row carrying the
   * portal userId — every OWN_CHILDREN scope check in the app (this
   * module's own list-scoping and AuthorizationService.checkOwnChildren)
   * resolves "which Parent is this?" via `findFirst({ userId })`, so two
   * live rows sharing one userId would silently hide whichever row
   * loses that lookup. `mergeOnto()` below re-points the losing row's
   * StudentParent links onto the surviving one and retires it, rather
   * than leaving that split in place.
   */
  async invite(schoolId: string, parentId: string, input: InviteParentInput, meta: RequestMeta) {
    const parent = await this.prisma.parent.findFirst({ where: { id: parentId, schoolId, deletedAt: null } });
    if (!parent) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    if (parent.userId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This parent already has a portal login.',
      });
    }

    const email = input.email || parent.email;
    if (!email) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'An email is required to invite this parent.',
      });
    }

    // Looked up by name, not a stored id: the default-seeded 'Parent'
    // role (docs/user-roles.md §3) is what OWN_CHILDREN grants resolve
    // against for a portal-login parent. A school that has renamed or
    // deleted it hits this clear error rather than silently inviting
    // someone with the wrong permissions.
    const parentRole = await this.prisma.role.findFirst({
      where: { schoolId, name: 'Parent', deletedAt: null },
    });
    if (!parentRole) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'No "Parent" role is configured for this school.',
      });
    }

    const existingUser = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (existingUser) {
      const existingMembership = await this.prisma.schoolMembership.findFirst({
        where: { userId: existingUser.id, schoolId, deletedAt: null },
      });
      if (existingMembership && existingMembership.roleId !== parentRole.id) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'This email belongs to an existing staff member of this school.',
        });
      }
      if (existingMembership && existingMembership.status === 'ACTIVE' && existingUser.status === 'ACTIVE') {
        // Already has a working portal login — no new invite needed,
        // just fold this Parent row onto whichever one already carries
        // that userId (see mergeOnto() above).
        await this.mergeOnto(schoolId, parentId, existingUser.id);
        await this.audit.record({
          schoolId,
          userId: existingUser.id,
          action: 'parent.portal_linked',
          module: 'parent',
          resourceType: 'Parent',
          resourceId: parentId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return { userId: existingUser.id, inviteToken: null };
      }
    }

    const { rawToken, userId } = await this.authService.createInvitation({
      email,
      firstName: parent.firstName,
      lastName: parent.lastName,
      schoolId,
      roleId: parentRole.id,
    });

    await this.mergeOnto(schoolId, parentId, userId);
    await this.audit.record({
      schoolId,
      userId,
      action: 'parent.invite_created',
      module: 'parent',
      resourceType: 'Parent',
      resourceId: parentId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { userId, inviteToken: rawToken };
  }

  // If a Parent row already carries this userId (a sibling's Parent
  // record, invited earlier with the same email), re-point `parentId`'s
  // StudentParent links onto it and soft-delete the now-redundant row.
  // Otherwise this is the first row for this userId — just link it.
  private async mergeOnto(schoolId: string, parentId: string, userId: string): Promise<void> {
    const canonical = await this.prisma.parent.findFirst({
      where: { schoolId, userId, deletedAt: null, id: { not: parentId } },
    });
    if (!canonical) {
      await this.prisma.parent.update({ where: { id: parentId }, data: { userId } });
      return;
    }

    const links = await this.prisma.studentParent.findMany({ where: { schoolId, parentId } });
    for (const link of links) {
      const duplicate = await this.prisma.studentParent.findFirst({
        where: { schoolId, parentId: canonical.id, studentId: link.studentId },
      });
      if (duplicate) {
        await this.prisma.studentParent.delete({ where: { id: link.id } });
      } else {
        await this.prisma.studentParent.update({ where: { id: link.id }, data: { parentId: canonical.id } });
      }
    }
    await this.prisma.parent.update({ where: { id: parentId }, data: { deletedAt: new Date() } });
  }
}
