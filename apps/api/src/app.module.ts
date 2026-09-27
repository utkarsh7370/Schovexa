import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    // Domain modules (auth, tenants, students, ...) are added here one at a
    // time as each is implemented, per docs/modules.md's phase order —
    // not stubbed in bulk ahead of being built.
  ],
})
export class AppModule {}
