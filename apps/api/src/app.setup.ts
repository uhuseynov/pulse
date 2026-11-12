import { StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from './config/env';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

/** Configuration shared by the real server and the e2e tests. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = config.get('WEB_ORIGIN', { infer: true });

  // Hosting platforms put one reverse proxy in front of the app. Trusting it
  // makes req.ip the visitor's address, which rate limiting depends on.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useWebSocketAdapter(new SocketIoAdapter(app, origins));
  app.enableShutdownHooks();
}
