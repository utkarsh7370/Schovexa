import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { StudentsModule } from './students/students.module';
import { SchoolsModule } from './schools/schools.module';
import { RolesModule } from './roles/roles.module';
import { MembershipsModule } from './memberships/memberships.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { ClassesModule } from './classes/classes.module';
import { SectionsModule } from './sections/sections.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TeachersModule } from './teachers/teachers.module';
import { ParentsModule } from './parents/parents.module';
import { DocumentsModule } from './documents/documents.module';
import { StorageModule } from './storage/storage.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FeeCategoriesModule } from './fee-categories/fee-categories.module';
import { FeeStructuresModule } from './fee-structures/fee-structures.module';
import { StudentFeesModule } from './student-fees/student-fees.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { OriginCheckMiddleware } from './common/origin-check.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Registered once, globally, here — every guard that opts in via
    // @UseGuards(ThrottlerGuard)/@UseGuards(LoginThrottlerGuard) shares
    // this single storage instance. Registering it again in a feature
    // module would split rate-limit counters across separate instances.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    AuthorizationModule,
    StorageModule,
    HealthModule,
    AuthModule,
    SchoolsModule,
    RolesModule,
    MembershipsModule,
    AcademicYearsModule,
    ClassesModule,
    SectionsModule,
    SubjectsModule,
    TeachersModule,
    StudentsModule,
    ParentsModule,
    DocumentsModule,
    AttendanceModule,
    FeeCategoriesModule,
    FeeStructuresModule,
    StudentFeesModule,
    // Further domain modules are added here one at a time as each is
    // implemented, per docs/modules.md's phase order.
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('*');
  }
}
