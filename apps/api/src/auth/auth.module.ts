import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';

// ThrottlerModule.forRoot() is registered once, globally, in AppModule —
// registering it again here would create a second, independent storage
// instance, splitting rate-limit counters between whichever guard
// happens to resolve which instance instead of sharing one bucket.
@Module({
  providers: [AuthService, AuthGuard, LoginThrottlerGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
