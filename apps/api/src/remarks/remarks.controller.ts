import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createRemarkSchema, updateRemarkSchema } from '@schovexa/validation';
import type { CreateRemarkInput, UpdateRemarkInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RemarksService } from './remarks.service';

@Controller('remarks')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class RemarksController {
  constructor(private readonly remarks: RemarksService) {}

  @Get()
  @RequirePermission('remark.view')
  list(@Query('studentId') studentId: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    if (!studentId) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'studentId is required.' });
    return this.remarks.list(auth, studentId);
  }

  @Post()
  @RequirePermission('remark.create')
  create(@Body(new ZodValidationPipe(createRemarkSchema)) body: CreateRemarkInput, @CurrentAuthContext() auth: AuthContext) {
    return this.remarks.create(auth, body);
  }

  @Patch(':id')
  @RequirePermission('remark.create')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateRemarkSchema)) body: UpdateRemarkInput, @CurrentAuthContext() auth: AuthContext) {
    return this.remarks.update(auth, id, body);
  }

  @Delete(':id')
  @RequirePermission('remark.create')
  remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.remarks.remove(auth, id);
  }
}
