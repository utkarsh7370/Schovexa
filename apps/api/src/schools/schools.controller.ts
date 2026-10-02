import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { registerSchoolSchema, updateSchoolSchema } from '@schovexa/validation';
import type { RegisterSchoolInput, UpdateSchoolInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requestMeta } from '../common/request-meta.util';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/auth.constants';
import { SchoolsService } from './schools.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  // The one deliberately public, account-creating endpoint — see
  // docs/api.md §7. Rate limited like login/forgot-password
  // (docs/authentication.md §4) since it creates real accounts.
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async register(
    @Body(new ZodValidationPipe(registerSchoolSchema)) body: RegisterSchoolInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { rawToken, schoolId } = await this.schoolsService.registerSchool(body, requestMeta(req));
    res.cookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(false));
    return { status: 'ok', schoolId };
  }

  @Get('me')
  @UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
  @RequirePermission('school.view')
  async getMine(@CurrentAuthContext() auth: AuthContext) {
    // No resourceId-level authorizeResource needed: "my own school" IS
    // auth.schoolId, already verified live by SchoolContextGuard — there
    // is no separate resource to compare it against.
    return this.schoolsService.getSchool(auth.schoolId);
  }

  @Patch('me')
  @UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
  @RequirePermission('school.update')
  async updateMine(
    @Body(new ZodValidationPipe(updateSchoolSchema)) body: UpdateSchoolInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.schoolsService.updateSchool(auth.schoolId, body);
  }

  // The logo is shown on every screen, so every member of the school may
  // fetch it (no permission beyond membership); only school.update changes it.
  @Get('me/logo')
  @UseGuards(AuthGuard, SchoolContextGuard)
  async logo(@CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { stream, mimeType } = await this.schoolsService.getLogo(auth.schoolId);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=300' });
    return new StreamableFile(stream);
  }

  @Post('me/logo')
  @UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
  @RequirePermission('school.update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentAuthContext() auth: AuthContext) {
    return this.schoolsService.setLogo(auth.schoolId, file);
  }

  @Delete('me/logo')
  @UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
  @RequirePermission('school.update')
  async deleteLogo(@CurrentAuthContext() auth: AuthContext) {
    return this.schoolsService.removeLogo(auth.schoolId);
  }
}
