import { appBaseUrl, appName, appUrl, contactInbox, supportEmail } from './branding';

describe('email branding (from the environment)', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults keep today’s wording', () => {
    delete process.env.APP_NAME;
    delete process.env.APP_URL;
    delete process.env.WEB_ORIGIN;
    delete process.env.SUPPORT_EMAIL;
    expect(appName()).toBe('Schovexa');
    expect(appUrl('/login')).toBe('http://localhost:3000/login');
    expect(supportEmail()).toBeNull();
  });

  it('APP_NAME, APP_URL and SUPPORT_EMAIL change what emails say', () => {
    process.env.APP_NAME = 'Sunrise Connect';
    process.env.APP_URL = 'https://app.sunrise.edu/';
    process.env.SUPPORT_EMAIL = 'help@sunrise.edu';
    expect(appName()).toBe('Sunrise Connect');
    expect(appBaseUrl()).toBe('https://app.sunrise.edu');
    expect(appUrl('/reset-password?token=x')).toBe('https://app.sunrise.edu/reset-password?token=x');
    expect(contactInbox('fallback@x.co')).toBe('help@sunrise.edu');
  });

  it('links fall back to the first WEB_ORIGIN, and CONTACT_INBOX_EMAIL beats SUPPORT_EMAIL', () => {
    delete process.env.APP_URL;
    process.env.WEB_ORIGIN = 'https://one.test, https://two.test';
    expect(appUrl('/x')).toBe('https://one.test/x');
    process.env.SUPPORT_EMAIL = 'help@sunrise.edu';
    process.env.CONTACT_INBOX_EMAIL = 'founder@sunrise.edu';
    expect(contactInbox('fallback@x.co')).toBe('founder@sunrise.edu');
    delete process.env.CONTACT_INBOX_EMAIL;
    delete process.env.SUPPORT_EMAIL;
    expect(contactInbox('fallback@x.co')).toBe('fallback@x.co');
  });
});
