import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so every feature module can inject PrismaService without each
// one re-importing PrismaModule — the same pattern NestJS docs recommend
// for a single shared DB connection.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
