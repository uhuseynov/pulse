import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MailService } from './mail.service';
import { escapeHtml, passwordResetEmail, welcomeEmail } from './mail.templates';

function service(values: Partial<Env>) {
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new MailService(config);
}

const mail = {
  to: 'ada@example.com',
  subject: 'Hello',
  text: 'Hello Ada',
  html: '<p>Hello Ada</p>',
};

describe('MailService', () => {
  const fetchMock = jest.fn();
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('posts the message to Resend with the API key', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mailer = service({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Pulse <no-reply@pulse.test>',
    });

    await expect(mailer.send(mail)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Pulse <no-reply@pulse.test>',
      to: ['ada@example.com'],
      subject: 'Hello',
      text: 'Hello Ada',
      html: '<p>Hello Ada</p>',
    });
  });

  it('reports a rejected message without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({ message: 'You can only send testing emails' }),
    });
    const mailer = service({ NODE_ENV: 'production', RESEND_API_KEY: 'k' });
    await expect(mailer.send(mail)).resolves.toBe(false);
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const mailer = service({ NODE_ENV: 'production', RESEND_API_KEY: 'k' });
    await expect(mailer.send(mail)).resolves.toBe(false);
  });

  it('sends nothing without an API key', async () => {
    const mailer = service({ NODE_ENV: 'production' });
    await expect(mailer.send(mail)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('collects messages instead of sending them in tests', async () => {
    const mailer = service({ NODE_ENV: 'test', RESEND_API_KEY: 'k' });
    await expect(mailer.send(mail)).resolves.toBe(true);
    expect(mailer.outbox).toEqual([mail]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('email templates', () => {
  it('escapes names in HTML but not in plain text', () => {
    const email = welcomeEmail('<b>Eve</b> & co', 'https://pulse.test');
    expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt; &amp; co');
    expect(email.html).not.toContain('<b>Eve</b>');
    expect(email.text).toContain('<b>Eve</b> & co');
    expect(email.html).toContain('https://pulse.test/app');
  });

  it('puts the reset link in both versions', () => {
    const link = 'https://pulse.test/reset-password?token=abc';
    const email = passwordResetEmail('Ada', link, 60);
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
    expect(email.text).toContain('60 minutes');
  });

  it('escapes every character that is special in HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
