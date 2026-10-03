import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/app-throttler.guard';
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
import { EmailModule } from './email/email.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FeeCategoriesModule } from './fee-categories/fee-categories.module';
import { FeeStructuresModule } from './fee-structures/fee-structures.module';
import { StudentFeesModule } from './student-fees/student-fees.module';
import { NoticesModule } from './notices/notices.module';
import { SchoolSettingsModule } from './school-settings/school-settings.module';
import { CalendarModule } from './calendar/calendar.module';
import { DepartmentsModule } from './departments/departments.module';
import { GroupsModule } from './groups/groups.module';
import { GradingModule } from './grading/grading.module';
import { HolidaysModule } from './holidays/holidays.module';
import { ReportsModule } from './reports/reports.module';
import { ContactModule } from './contact/contact.module';
import { ProfileModule } from './profile/profile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StaffAttendanceModule } from './staff-attendance/staff-attendance.module';
import { FinanceModule } from './finance/finance.module';
import { TeachingCoreModule } from './teaching/teaching-core.module';
import { TimetableModule } from './timetable/timetable.module';
import { CourseworkModule } from './coursework/coursework.module';
import { ContentModule } from './content/content.module';
import { ExamsModule } from './exams/exams.module';
import { RemarksModule } from './remarks/remarks.module';
import { MessagesModule } from './messages/messages.module';
import { LeaveModule } from './leave/leave.module';
import { EventsModule } from './events/events.module';
import { TeachingModule } from './teaching/teaching.module';
import { PaymentsModule } from './payments/payments.module';
import { RefundsModule } from './refunds/refunds.module';
import { ConcessionsModule } from './concessions/concessions.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { OriginCheckMiddleware } from './common/origin-check.middleware';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { AuditTrailInterceptor } from './audit/audit-trail.interceptor';
import { AuditLogsModule } from './audit/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Registered once, globally, here — the single storage instance behind
    // every rate limit. With REDIS_URL set the counters live in Redis and are
    // shared by every API instance; without it (local development, tests)
    // each process counts for itself.
    //
    // The default is the whole-API flood limit (per client address, per
    // minute); sensitive routes tighten it with @Throttle. The guard that
    // enforces it is registered once as APP_GUARD below — routes must NOT
    // also list ThrottlerGuard themselves, or each request counts twice.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600) }],
      storage: process.env.REDIS_URL && process.env.NODE_ENV !== 'test' ? new RedisThrottlerStorage(process.env.REDIS_URL) : undefined,
    }),
    PrismaModule,
    AuditModule,
    AuthorizationModule,
    StorageModule,
    EmailModule,
    NotificationsModule,
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
    NoticesModule,
    HolidaysModule,
    SchoolSettingsModule,
    CalendarModule,
    DepartmentsModule,
    GroupsModule,
    GradingModule,
    ReportsModule,
    ContactModule,
    AuditLogsModule,
    ProfileModule,
    StaffAttendanceModule,
    TeachingCoreModule,
    TimetableModule,
    CourseworkModule,
    ContentModule,
    ExamsModule,
    RemarksModule,
    MessagesModule,
    LeaveModule,
    EventsModule,
    TeachingModule,
    FinanceModule,
    PaymentsModule,
    RefundsModule,
    ConcessionsModule,
    // Further domain modules are added here one at a time as each is
    // implemented, per docs/modules.md's phase order.
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditTrailInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, SecurityHeadersMiddleware, OriginCheckMiddleware).forRoutes('*');
  }
}
