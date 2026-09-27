import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { SchoolContextGuard } from './guards/school-context.guard';
import { PermissionGuard } from './guards/permission.guard';

// Global for the same reason as PrismaModule/AuditModule: every
// school-scoped route across every future module needs these guards and
// AuthorizationService — re-importing this per module would be pure
// boilerplate, and per docs/authorization.md §1 there must be exactly one
// authorization implementation, not one per module.
@Global()
@Module({
  providers: [AuthorizationService, SchoolContextGuard, PermissionGuard],
  exports: [AuthorizationService, SchoolContextGuard, PermissionGuard],
})
export class AuthorizationModule {}
