import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';

/**
 * The shared Redis connection, or null when REDIS_URL is not set. Without
 * Redis every feature falls back to in-memory state, which is correct as
 * long as the API runs as a single instance.
 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis | null;

  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true });
    this.client = url ? new Redis(url) : null;
    this.client?.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  // Runs after the sockets have closed, so their cleanup can still use Redis.
  async onApplicationShutdown() {
    await this.client?.quit().catch(() => undefined);
  }
}
