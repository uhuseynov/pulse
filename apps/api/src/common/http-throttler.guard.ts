import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting for REST requests only. A global guard also runs for
 * WebSocket messages, where there is no client address to count by: every
 * socket would share one bucket, and a busy server would start dropping
 * everyone's events.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }
}
