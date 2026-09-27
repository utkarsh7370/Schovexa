import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Single shared Prisma connection for the app. Every domain repository
// injects this rather than instantiating its own PrismaClient — see
// docs/multi-tenancy.md §3 for the tenant-scoping convention built on
// top of it (a required schoolId in every school-owned query).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
