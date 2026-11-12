import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

/** Configuration shared by the real server and the e2e tests. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origin = config.get('WEB_ORIGIN', { infer: true });

  app.enableCors({ origin, credentials: true });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useWebSocketAdapter(new SocketIoAdapter(app, origin));
  app.enableShutdownHooks();
}
