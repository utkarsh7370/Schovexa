// The product name, web address and support contact that appear *inside*
// emails — read from the environment so a white-label deployment never has
// "Schovexa" baked into a message. Defaults keep today's wording.

const clean = (v: string | undefined) => (v ?? '').trim();

/** The name used in subjects and text, e.g. "Welcome to Schovexa". APP_NAME. */
export function appName(): string {
  return clean(process.env.APP_NAME) || 'Schovexa';
}

/**
 * The web app's address, no trailing slash. APP_URL if set, otherwise the first
 * entry of WEB_ORIGIN (which the API already needs), otherwise localhost.
 */
export function appBaseUrl(): string {
  const configured = clean(process.env.APP_URL) || clean(process.env.WEB_ORIGIN).split(',')[0].trim();
  return (configured || 'http://localhost:3000').replace(/\/+$/, '');
}

/** A link into the web app, e.g. appUrl('/login'). */
export function appUrl(path = ''): string {
  return `${appBaseUrl()}${path}`;
}

/** Where people can write for help (shown in emails when set). SUPPORT_EMAIL. */
export function supportEmail(): string | null {
  return clean(process.env.SUPPORT_EMAIL) || null;
}

/** Where the website Contact form is delivered. CONTACT_INBOX_EMAIL, else SUPPORT_EMAIL. */
export function contactInbox(fallback: string): string {
  return clean(process.env.CONTACT_INBOX_EMAIL) || supportEmail() || fallback;
}
