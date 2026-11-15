import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that applies the same CORS origins as the REST API and,
 * when Redis is configured, relays events between API instances so a
 * broadcast reaches every client no matter which instance it is connected to.
 */
export class SocketIoAdapter extends IoAdapter {
  private subscriber?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
    private readonly redis: Redis | null,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const withCors = {
      ...options,
      cors: { origin: this.origins, credentials: true },
    } as ServerOptions;
    const server = super.createIOServer(port, withCors) as Server;
    if (this.redis) {
      this.subscriber ??= this.redis.duplicate();
      this.subscriber.on('error', () => undefined);
      server.adapter(createAdapter(this.redis, this.subscriber));
    }
    return server;
  }

  async dispose() {
    await this.subscriber?.quit().catch(() => undefined);
    await super.dispose();
  }
}
