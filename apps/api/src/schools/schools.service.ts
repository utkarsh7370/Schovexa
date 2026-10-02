import { ConflictException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthService, RequestMeta } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { StorageService } from '../storage/storage.service';
import { sniffDocumentType } from '../documents/documents.service';
import type { RegisterSchoolInput, UpdateSchoolInput } from '@schovexa/validation';

const LOGO_MAX_BYTES = 1024 * 1024;

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
    private readonly storage: StorageService,
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
      where: { email: { equals: input.email, mode: 'insensitive' }, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An account with this email already exists.',
      });
    }

    // Self-registration exists for one person only: the owner of a new school.
    // Everyone else is added by the school (see AuthService.createInvitation).
    this.authService.assertPasswordAcceptable(input.password, {
      email: input.email,
      firstName: input.directorFirstName,
      lastName: input.directorLastName,
    });

    const slug = await this.generateUniqueSlug(input.schoolName);
    const passwordHash = await this.authService.hashPassword(input.password);

    const { schoolId, userId, membershipId } = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({ data: { name: input.schoolName, slug, ...(input.country ? { country: input.country } : {}) } });
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

    // Prove they own the address they signed up with. (Some sensitive
    // actions wait for this — see SensitiveAction.)
    await this.authService.sendVerificationEmail(userId);

    // Auto-login + auto-select-school for a smooth signup -> dashboard
    // experience, reusing the already-tested Phase 3 session logic rather
    // than hand-rolling session creation here.
    const { rawToken } = await this.authService.login(input.email, input.password, meta);
    const session = await this.authService.validateSession(rawToken);
    await this.authService.selectSchool(userId, session!.sessionId, membershipId);

    return { rawToken, schoolId, membershipId };
  }

  async getSchool(schoolId: string) {
    const { logoKey, ...school } = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    // The storage key stays server-side; the app asks for the file itself.
    return { ...school, hasLogo: !!logoKey };
  }

  // A school logo: a small PNG or JPEG, identified by its content like every
  // other upload, kept in object storage and served only to the school's members.
  async setLogo(schoolId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'No file was uploaded.' });
    const detected = sniffDocumentType(file.buffer);
    if (detected !== 'image/png' && detected !== 'image/jpeg') {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The logo must be a PNG or JPEG image.' });
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The logo is too large (max 1 MB).' });
    }
    const school = await this.prisma.school.findFirstOrThrow({ where: { id: schoolId, deletedAt: null } });
    const key = this.storage.buildKey(schoolId, 'School', schoolId, detected === 'image/png' ? 'logo.png' : 'logo.jpg');
    await this.storage.putObject(key, file.buffer);
    await this.prisma.school.update({ where: { id: schoolId }, data: { logoKey: key } });
    if (school.logoKey) await this.storage.deleteObject(school.logoKey).catch(() => undefined);
    return this.getSchool(schoolId);
  }

  async removeLogo(schoolId: string) {
    const school = await this.prisma.school.findFirstOrThrow({ where: { id: schoolId, deletedAt: null } });
    if (school.logoKey) {
      await this.prisma.school.update({ where: { id: schoolId }, data: { logoKey: null } });
      await this.storage.deleteObject(school.logoKey).catch(() => undefined);
    }
    return this.getSchool(schoolId);
  }

  async getLogo(schoolId: string) {
    const school = await this.prisma.school.findFirst({ where: { id: schoolId, deletedAt: null }, select: { logoKey: true } });
    if (!school?.logoKey) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return { stream: await this.storage.getObjectStream(school.logoKey), mimeType: school.logoKey.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  async updateSchool(schoolId: string, input: UpdateSchoolInput) {
    const school = await this.prisma.school.findFirst({ where: { id: schoolId, deletedAt: null } });
    if (!school) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    // The schema only sees the fields in this request, so a lone punch-in of
    // 17:00 slips past it — check the result against what is already saved.
    const punchIn = input.staffPunchInTime ?? school.staffPunchInTime;
    const punchOut = input.staffPunchOutTime ?? school.staffPunchOutTime;
    if (punchOut <= punchIn) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Punch-out (${punchOut}) must be later than punch-in (${punchIn}).`,
        details: [{ field: input.staffPunchInTime ? 'staffPunchInTime' : 'staffPunchOutTime', message: 'Punch-out must be later than punch-in' }],
      });
    }
    // An emptied text box clears the field rather than saving "".
    const data: Record<string, unknown> = { ...input };
    for (const key of ['motto', 'description', 'schoolCode', 'board', 'schoolType', 'affiliationNo', 'alternatePhone', 'city', 'state', 'postalCode', 'address']) {
      if (data[key] === '') data[key] = null;
    }
    await this.prisma.school.update({ where: { id: schoolId }, data });
    return this.getSchool(schoolId);
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
