import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { createFeeStructureSchema } from '@schovexa/validation';
import type { CreateFeeStructureInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FeeStructuresService } from './fee-structures.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('fee-structures')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class FeeStructuresController {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  @Get()
  @RequirePermission('fee.view')
  async list(@Query('academicYearId') academicYearId: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.feeStructuresService.list(auth.schoolId, academicYearId);
  }

  @Post()
  @RequirePermission('fee.create')
  async create(
    @Body(new ZodValidationPipe(createFeeStructureSchema)) body: CreateFeeStructureInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.feeStructuresService.create(auth.schoolId, body);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('fee.create')
  async assign(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.feeStructuresService.assignToClass(auth.schoolId, id);
  }
}
