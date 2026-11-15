import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export interface Mail {
  to: string;
  subject: string;
  /** Plain-text version, for clients that do not show HTML. */
  text: string;
  html: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends email through Resend's HTTP API. Sending never throws: a message
 * that cannot be delivered is logged, and the request that caused it carries
 * on. Without an API key nothing is sent.
 */
@Injectable()
export class MailService {
  /** Messages "sent" during tests, newest last. Empty everywhere else. */
  readonly outbox: Mail[] = [];

  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly environment: Env['NODE_ENV'];

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.environment = config.get('NODE_ENV', { infer: true });
  }

  /** Resolves to true when the provider accepted the message. */
  async send(mail: Mail): Promise<boolean> {
    if (this.environment === 'test') {
      this.outbox.push(mail);
      return true;
    }
    if (!this.apiKey) {
      this.logUnsent(mail);
      return false;
    }

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        this.logger.warn(
          `"${mail.subject}" was not sent (${response.status}): ` +
            (body?.message ?? 'no details'),
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`"${mail.subject}" was not sent: ${String(error)}`);
      return false;
    }
  }

  private logUnsent(mail: Mail) {
    if (this.environment === 'development') {
      // Lets a developer follow a reset link without an email account.
      this.logger.log(
        `RESEND_API_KEY is not set, so this email was not sent.\n` +
          `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`,
      );
    } else {
      // Never the body: a reset link in production logs would be a way in.
      this.logger.warn(
        `"${mail.subject}" was not sent: RESEND_API_KEY is not set`,
      );
    }
  }
}
