// Every email setting, read from environment variables — nothing about
// sending mail is hardcoded. Add the variables to .env (see .env.example)
// and email works; leave them out and email is simply off (messages are
// logged, never sent), so local development needs no credentials.
//
// Read on each call rather than once at import, so a test (or a restart
// with new values) always sees the current environment.

type Env = Record<string, string | undefined>;

export interface SmtpPreset {
  host: string;
  port: number;
  /** true = implicit TLS (port 465). false = STARTTLS upgrade (port 587). */
  secure: boolean;
  /** What to put in SMTP_USER / SMTP_PASSWORD for this provider. */
  hint: string;
}

// EMAIL_PROVIDER=<name> fills in host, port and TLS for the common providers,
// so the deployer only supplies credentials. Anything set explicitly
// (SMTP_HOST, SMTP_PORT, SMTP_SECURE) still wins over the preset.
export const SMTP_PRESETS: Record<string, SmtpPreset> = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false, hint: 'SMTP_USER = your Gmail address, SMTP_PASSWORD = an App Password (not your normal password)' },
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false, hint: 'SMTP_USER = your Outlook/Microsoft 365 address, SMTP_PASSWORD = its password or app password' },
  zoho: { host: 'smtp.zoho.com', port: 465, secure: true, hint: 'SMTP_USER = your Zoho address, SMTP_PASSWORD = its password or app password' },
  brevo: { host: 'smtp-relay.brevo.com', port: 587, secure: false, hint: 'SMTP_USER = your Brevo login, SMTP_PASSWORD = an SMTP key' },
  sendgrid: { host: 'smtp.sendgrid.net', port: 587, secure: false, hint: 'SMTP_USER = apikey, SMTP_PASSWORD = your SendGrid API key' },
  mailgun: { host: 'smtp.mailgun.org', port: 587, secure: false, hint: 'SMTP_USER = postmaster@your-domain, SMTP_PASSWORD = your Mailgun SMTP password' },
  resend: { host: 'smtp.resend.com', port: 465, secure: true, hint: 'SMTP_USER = resend, SMTP_PASSWORD = your Resend API key' },
  postmark: { host: 'smtp.postmarkapp.com', port: 587, secure: false, hint: 'SMTP_USER and SMTP_PASSWORD = your Postmark server token' },
  ses: { host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false, hint: 'SMTP_USER / SMTP_PASSWORD = your SES SMTP credentials; set SMTP_HOST if your region is not us-east-1' },
};

export interface EmailConfig {
  /** False when email can't be sent — see `problems` for why. */
  enabled: boolean;
  /** Plain-English reasons email is off or incomplete (never contains a secret). */
  problems: string[];
  provider: string | null;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string | null;
    password: string | null;
    requireTls: boolean;
    rejectUnauthorized: boolean;
    pool: boolean;
    connectionTimeoutMs: number;
  } | null;
  /** The finished From header, e.g. `Sunrise School <no-reply@sunrise.edu>`. */
  from: string;
  fromAddress: string;
  fromName: string;
  replyTo: string | null;
  bcc: string[];
  subjectPrefix: string;
  /** When set, every message goes here instead of its real recipient (staging safety). */
  redirectAllTo: string | null;
}

const truthy = (v: string | undefined) => v !== undefined && /^(1|true|yes|on)$/i.test(v.trim());
const falsy = (v: string | undefined) => v !== undefined && /^(0|false|no|off)$/i.test(v.trim());
const clean = (v: string | undefined) => (v ?? '').trim();
const looksLikeEmail = (v: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
const list = (v: string | undefined) => clean(v).split(',').map((s) => s.trim()).filter(Boolean);

/** Splits `Name <a@b.c>` or `a@b.c` into its parts; null when it isn't an address. */
export function parseAddress(value: string): { name: string; address: string } | null {
  const match = clean(value).match(/^(?:"?([^"<]*)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/);
  if (match) return { name: clean(match[1]), address: match[2] };
  return looksLikeEmail(clean(value)) ? { name: '', address: clean(value) } : null;
}

export function resolveEmailConfig(env: Env = process.env): EmailConfig {
  const problems: string[] = [];
  const providerName = clean(env.EMAIL_PROVIDER).toLowerCase() || null;
  const preset = providerName && providerName !== 'custom' ? SMTP_PRESETS[providerName] : undefined;
  if (providerName && providerName !== 'custom' && !preset) {
    problems.push(`EMAIL_PROVIDER “${providerName}” isn’t known. Use one of: ${Object.keys(SMTP_PRESETS).join(', ')}, custom — or set SMTP_HOST yourself.`);
  }

  // SMTP_URL (smtp://user:pass@host:587 or smtps://…) is the one-variable way.
  let urlParts: { host: string; port?: number; secure: boolean; user: string | null; password: string | null } | null = null;
  if (clean(env.SMTP_URL)) {
    try {
      const u = new URL(clean(env.SMTP_URL));
      urlParts = {
        host: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        secure: u.protocol === 'smtps:',
        user: u.username ? decodeURIComponent(u.username) : null,
        password: u.password ? decodeURIComponent(u.password) : null,
      };
    } catch {
      problems.push('SMTP_URL isn’t a valid URL. Expected something like smtps://user:password@smtp.example.com:465.');
    }
  }

  const host = clean(env.SMTP_HOST) || urlParts?.host || preset?.host || '';
  const secure = env.SMTP_SECURE !== undefined && clean(env.SMTP_SECURE) !== '' ? truthy(env.SMTP_SECURE) : (urlParts?.secure ?? preset?.secure ?? false);
  const portRaw = clean(env.SMTP_PORT);
  const port = portRaw ? Number(portRaw) : (urlParts?.port ?? preset?.port ?? (secure ? 465 : 587));
  const user = clean(env.SMTP_USER) || urlParts?.user || null;
  const password = env.SMTP_PASSWORD !== undefined && env.SMTP_PASSWORD !== '' ? env.SMTP_PASSWORD : (urlParts?.password ?? null);

  if (portRaw && (!Number.isInteger(port) || port < 1 || port > 65535)) problems.push(`SMTP_PORT “${portRaw}” isn’t a valid port number.`);
  if (host && user && !password) problems.push('SMTP_USER is set but SMTP_PASSWORD is empty.');
  if (host && !user && password) problems.push('SMTP_PASSWORD is set but SMTP_USER is empty.');

  // --- Sender --------------------------------------------------------------
  // EMAIL_FROM_ADDRESS + EMAIL_FROM_NAME is the clear way; SMTP_FROM
  // ("Name <a@b.c>") still works for existing setups. Without either, the
  // login address is used — which is what Gmail and most providers require.
  const legacy = parseAddress(clean(env.SMTP_FROM));
  const appName = clean(env.APP_NAME) || 'Schovexa';
  const fromName = clean(env.EMAIL_FROM_NAME) || legacy?.name || appName;
  const fromAddress = clean(env.EMAIL_FROM_ADDRESS) || legacy?.address || (user && looksLikeEmail(user) ? user : 'no-reply@schovexa.app');
  if (!looksLikeEmail(fromAddress)) problems.push(`EMAIL_FROM_ADDRESS “${fromAddress}” isn’t an email address.`);
  const from = `"${fromName.replace(/["\\\r\n]/g, '')}" <${fromAddress}>`;

  const replyTo = clean(env.EMAIL_REPLY_TO) || null;
  if (replyTo && !looksLikeEmail(replyTo)) problems.push(`EMAIL_REPLY_TO “${replyTo}” isn’t an email address.`);
  const bcc = list(env.EMAIL_BCC).filter((a) => {
    const ok = looksLikeEmail(a);
    if (!ok) problems.push(`EMAIL_BCC contains “${a}”, which isn’t an email address.`);
    return ok;
  });
  const redirectAllTo = clean(env.EMAIL_REDIRECT_ALL_TO) || null;
  if (redirectAllTo && !looksLikeEmail(redirectAllTo)) problems.push(`EMAIL_REDIRECT_ALL_TO “${redirectAllTo}” isn’t an email address.`);

  // --- On / off -------------------------------------------------------------
  let enabled = Boolean(host) && !problems.some((p) => /SMTP_PORT|SMTP_URL|SMTP_USER is set but|SMTP_PASSWORD is set but|EMAIL_FROM_ADDRESS/.test(p));
  if (falsy(env.EMAIL_ENABLED)) {
    enabled = false;
    problems.push('EMAIL_ENABLED is off, so no email is sent.');
  } else if (!host) {
    problems.push(
      preset || providerName === 'custom'
        ? 'Email provider chosen but SMTP_HOST is missing.'
        : 'Email isn’t set up: add EMAIL_PROVIDER (gmail, outlook, …) or SMTP_HOST to the environment.',
    );
  }

  return {
    enabled,
    problems,
    provider: providerName,
    smtp: host
      ? {
          host,
          port,
          secure,
          user,
          password,
          requireTls: truthy(env.SMTP_REQUIRE_TLS),
          rejectUnauthorized: !falsy(env.SMTP_REJECT_UNAUTHORIZED),
          pool: truthy(env.SMTP_POOL),
          connectionTimeoutMs: Number(env.SMTP_CONNECTION_TIMEOUT_MS) > 0 ? Number(env.SMTP_CONNECTION_TIMEOUT_MS) : 15_000,
        }
      : null,
    from,
    fromAddress,
    fromName,
    replyTo,
    bcc,
    subjectPrefix: clean(env.EMAIL_SUBJECT_PREFIX),
    redirectAllTo,
  };
}

/** One line for the startup log — what email will do, without any secret. */
export function describeEmailConfig(config: EmailConfig): string {
  if (!config.enabled || !config.smtp) return `Email is OFF — messages are logged, not sent. ${config.problems[0] ?? ''}`.trim();
  const extras = [
    config.redirectAllTo ? `ALL mail redirected to ${config.redirectAllTo}` : null,
    config.bcc.length ? `bcc ${config.bcc.length}` : null,
    config.replyTo ? `reply-to ${config.replyTo}` : null,
  ].filter(Boolean);
  return `Email is ON via ${config.provider ?? 'SMTP'} (${config.smtp.host}:${config.smtp.port}, ${config.smtp.secure ? 'TLS' : 'STARTTLS'}), sending as ${config.from}${extras.length ? ` — ${extras.join(', ')}` : ''}.`;
}
