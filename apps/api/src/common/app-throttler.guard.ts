import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { ThrottlerGenerateKeyFunction, ThrottlerGetTrackerFunction } from '@nestjs/throttler/dist/throttler-module-options.interface';

/**
 * Sliding request limits for the whole API — the same as Nest's ThrottlerGuard,
 * with one development convenience: DEV_RELAX_RATE_LIMITS=true multiplies every
 * limit by 100, so a developer can run the demo-data seeder (which registers a
 * school and accepts ~15 invitations from one address) as often as they like.
 *
 * It is ignored when NODE_ENV=production — the protection against password
 * guessing and signup abuse can't be switched off by a stray environment variable
 * on a live server. (The per-email sign-in lockout is separate and never relaxed.)
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private static readonly RELAXED_MULTIPLIER = 100;
  private readonly logger = new Logger('RateLimit');
  private warned = false;

  private get relaxed(): boolean {
    return /^(1|true|yes|on)$/i.test((process.env.DEV_RELAX_RATE_LIMITS ?? '').trim()) && process.env.NODE_ENV !== 'production';
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    if (this.relaxed && !this.warned) {
      this.warned = true;
      this.logger.warn(`DEV_RELAX_RATE_LIMITS is on: request limits are ${AppThrottlerGuard.RELAXED_MULTIPLIER}× higher. Development only.`);
    }
    return super.handleRequest(context, this.relaxed ? limit * AppThrottlerGuard.RELAXED_MULTIPLIER : limit, ttl, throttler, getTracker, generateKey);
  }
}
