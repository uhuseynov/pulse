import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/** Socket.IO adapter that applies the same CORS origins as the REST API. */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const withCors = {
      ...options,
      cors: { origin: this.origins, credentials: true },
    } as ServerOptions;
    return super.createIOServer(port, withCors);
  }
}
