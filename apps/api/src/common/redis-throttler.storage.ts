import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

// Rate-limit counters kept in Redis, so every API instance shares one count
// per client (docs/security-scalability-review.md F3). An in-memory counter
// gives each instance its own, so an attacker behind a load balancer would
// get N times the attempts.
//
// If Redis can't be reached, this falls back to the in-memory counter rather
// than rejecting every request: losing the shared count for a while is a
// smaller harm than taking the API down, and it is logged.
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private readonly fallback = new ThrottlerStorageService();
  private warned = false;

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    this.redis.on('error', (err) => {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Redis unavailable for rate limiting — using per-instance counters (${err.message})`);
      }
    });
    this.redis.on('ready', () => {
      this.warned = false;
    });
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    try {
      const redisKey = `schovexa:throttle:${key}`;
      const totalHits = await this.redis.incr(redisKey);
      let remainingMs = await this.redis.pttl(redisKey);
      if (totalHits === 1 || remainingMs < 0) {
        await this.redis.pexpire(redisKey, ttl);
        remainingMs = ttl;
      }
      return { totalHits, timeToExpire: Math.ceil(remainingMs / 1000) };
    } catch {
      return this.fallback.increment(key, ttl);
    }
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
