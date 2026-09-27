import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

// ThrottlerModule.forRoot() is registered once, globally, in AppModule —
// see the note in auth.module.ts.
@Module({
  imports: [AuthModule, RolesModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
