import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { replaceGradingSchema } from '@schovexa/validation';
import type { ReplaceGradingInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GradingService } from './grading.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('grading')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get()
  @RequirePermission('school.view')
  async get(@CurrentAuthContext() auth: AuthContext) {
    return this.grading.get(auth.schoolId);
  }

  @Get('preview')
  @RequirePermission('school.view')
  async preview(@Query('percent') percent: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const value = Number(percent);
    if (percent === undefined || percent === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Enter a percentage from 0 to 100.' });
    }
    return this.grading.preview(auth.schoolId, value);
  }

  @Put()
  @RequirePermission('school.update')
  async replace(@Body(new ZodValidationPipe(replaceGradingSchema)) body: ReplaceGradingInput, @CurrentAuthContext() auth: AuthContext) {
    return this.grading.replace(auth.schoolId, body);
  }
}
