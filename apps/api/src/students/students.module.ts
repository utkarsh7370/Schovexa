import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentsController } from './students.controller';

@Module({
  // AuthModule is not global (unlike AuthorizationModule) — it must be
  // imported wherever AuthGuard is used via @UseGuards(AuthGuard).
  imports: [AuthModule],
  controllers: [StudentsController],
})
export class StudentsModule {}
