import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from '../authorization/authorization.types';

// Deliberately minimal — ONE read-only endpoint, not a Students CRUD
// module. Its purpose is to prove the full Phase 4 authorization pipeline
// (AuthGuard -> SchoolContextGuard -> PermissionGuard -> resource-level
// authorizeResource) against a real resource end-to-end over HTTP, using
// exactly the permission the master brief's own canonical example names
// ("student.view"). The full Students module (create/update/admissions/
// documents/...) is a later, dedicated phase per docs/modules.md.
@Controller('students')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StudentsController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id')
  @RequirePermission('student.view')
  async findOne(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);

    // Defense-in-depth Layer 2 (docs/multi-tenancy.md §3): re-filter by
    // schoolId here too, independent of the guard/service check above.
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId: auth.schoolId, deletedAt: null },
    });
    if (!student) {
      // Should be rare — authorizeResource just confirmed this above —
      // but never assume a prior check makes this query safe to skip; a
      // genuine race (soft-deleted between the two calls) is a 404, not
      // a permission failure.
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }

    return {
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      sectionId: student.sectionId,
      status: student.status,
    };
  }
}
