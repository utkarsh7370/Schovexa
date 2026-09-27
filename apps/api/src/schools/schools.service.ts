import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, RequestMeta } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import type { RegisterSchoolInput, UpdateSchoolInput } from '@schovexa/validation';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The one deliberately public, unauthenticated, account-creating
   * endpoint in the system (docs/api.md §7) — there is no admin to
   * invite the first user of a brand-new school, so this bootstraps
   * School + default roles + the first ACTIVE user + membership in one
   * transaction, then auto-logs them in (a school with no usable roles,
   * or a director who can't sign in, is a broken registration — not
   * something to patch up after the fact).
   */
  async registerSchool(input: RegisterSchoolInput, meta: RequestMeta) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An account with this email already exists.',
      });
    }

    const slug = await this.generateUniqueSlug(input.schoolName);
    const passwordHash = await this.authService.hashPassword(input.password);

    const { schoolId, userId, membershipId } = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({ data: { name: input.schoolName, slug } });
      await this.rolesService.seedDefaultRoles(school.id, tx);
      const directorRole = await tx.role.findFirstOrThrow({
        where: { schoolId: school.id, name: 'Director' },
      });

      const director = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.directorFirstName,
          lastName: input.directorLastName,
          passwordHash,
          status: 'ACTIVE',
          // emailVerifiedAt intentionally left null: self-registration
          // doesn't prove email ownership the way clicking an emailed
          // invite token does (docs/authentication.md §8). MVP still
          // allows login since there's no email delivery yet to gate on
          // (Phase 2) — a documented gap, not a silent one.
        },
      });
      const membership = await tx.schoolMembership.create({
        data: { userId: director.id, schoolId: school.id, roleId: directorRole.id },
      });

      return { schoolId: school.id, userId: director.id, membershipId: membership.id };
    });

    await this.audit.record({
      schoolId,
      userId,
      action: 'school.register',
      module: 'school',
      resourceType: 'School',
      resourceId: schoolId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Auto-login + auto-select-school for a smooth signup -> dashboard
    // experience, reusing the already-tested Phase 3 session logic rather
    // than hand-rolling session creation here.
    const { rawToken } = await this.authService.login(input.email, input.password, meta);
    const session = await this.authService.validateSession(rawToken);
    await this.authService.selectSchool(userId, session!.sessionId, membershipId);

    return { rawToken, schoolId, membershipId };
  }

  async getSchool(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  }

  async updateSchool(schoolId: string, input: UpdateSchoolInput) {
    const school = await this.prisma.school.findFirst({ where: { id: schoolId, deletedAt: null } });
    if (!school) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return this.prisma.school.update({ where: { id: schoolId }, data: input });
  }

  private async generateUniqueSlug(schoolName: string): Promise<string> {
    const base = slugify(schoolName) || 'school';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.school.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
    }
    // Astronomically unlikely with the loop above, but never loop forever.
    return `${base}-${Date.now()}`;
  }
}
