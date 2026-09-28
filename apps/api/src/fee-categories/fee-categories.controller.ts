import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createFeeCategorySchema } from '@schovexa/validation';
import type { CreateFeeCategoryInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FeeCategoriesService } from './fee-categories.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('fee-categories')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class FeeCategoriesController {
  constructor(private readonly feeCategoriesService: FeeCategoriesService) {}

  @Get()
  @RequirePermission('fee.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.feeCategoriesService.list(auth.schoolId);
  }

  @Post()
  @RequirePermission('fee.create')
  async create(
    @Body(new ZodValidationPipe(createFeeCategorySchema)) body: CreateFeeCategoryInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.feeCategoriesService.create(auth.schoolId, body);
  }
}
