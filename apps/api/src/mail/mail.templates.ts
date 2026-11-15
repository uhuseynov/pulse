import type { Mail } from './mail.service';

type Content = Omit<Mail, 'to'>;

/** Display names are chosen by users, so they are escaped before use in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(heading: string, paragraphs: string[], button?: Button) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`)
    .join('');
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" ` +
      `style="background:#4f46e5;color:#ffffff;text-decoration:none;` +
      `padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">` +
      `${button.label}</a></p>` +
      `<p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:#6b7280">` +
      `If the button does not work, copy this address into your browser:<br>` +
      `${escapeHtml(button.url)}</p>`
    : '';
  return (
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;` +
    `max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">` +
    `<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#4f46e5">pulse</p>` +
    `<h1 style="margin:0 0 16px;font-size:22px">${heading}</h1>` +
    `${body}${action}</div>`
  );
}

interface Button {
  label: string;
  url: string;
}

export function welcomeEmail(displayName: string, appUrl: string): Content {
  const name = escapeHtml(displayName);
  return {
    subject: 'Welcome to Pulse',
    text:
      `Hi ${displayName},\n\n` +
      `Your Pulse account is ready. Create a server or join one with an ` +
      `invite code, add your friends, and start talking.\n\n` +
      `Open Pulse: ${appUrl}/app\n`,
    html: layout(
      `Welcome, ${name}`,
      [
        'Your Pulse account is ready.',
        'Create a server or join one with an invite code, add your friends, and start talking.',
      ],
      { label: 'Open Pulse', url: `${appUrl}/app` },
    ),
  };
}

export function passwordResetEmail(
  displayName: string,
  link: string,
  validMinutes: number,
): Content {
  const name = escapeHtml(displayName);
  return {
    subject: 'Reset your Pulse password',
    text:
      `Hi ${displayName},\n\n` +
      `Someone asked to reset the password of your Pulse account. To choose ` +
      `a new one, open this link within ${validMinutes} minutes:\n\n` +
      `${link}\n\n` +
      `If it was not you, ignore this email. Your password stays the same.\n`,
    html: layout(
      'Reset your password',
      [
        `Hi ${name},`,
        `Someone asked to reset the password of your Pulse account. The button below works for ${validMinutes} minutes and only once.`,
        'If it was not you, ignore this email. Your password stays the same.',
      ],
      { label: 'Choose a new password', url: link },
    ),
  };
}
