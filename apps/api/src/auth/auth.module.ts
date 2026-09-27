import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';

@Module({
  imports: [
    // Default bucket for any route that opts in via a Throttler guard;
    // routes without that guard are unaffected. See docs/authentication.md §4.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
  ],
  providers: [AuthService, AuthGuard, LoginThrottlerGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
