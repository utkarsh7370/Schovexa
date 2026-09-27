import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createParentSchema } from '@schovexa/validation';
import type { CreateParentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ParentsService } from './parents.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('parents')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get()
  @RequirePermission('parent.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.parentsService.list(auth.schoolId);
  }

  @Post()
  @RequirePermission('parent.create')
  async create(
    @Body(new ZodValidationPipe(createParentSchema)) body: CreateParentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.parentsService.create(auth.schoolId, body);
  }
}
