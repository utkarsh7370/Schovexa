import { describeEmailConfig, parseAddress, resolveEmailConfig } from './email.config';

// The email settings are all environment variables; these pin down what each
// combination of them means, so "add the variables and it works" stays true.

describe('resolveEmailConfig', () => {
  it('is off with nothing set, and says how to turn it on', () => {
    const c = resolveEmailConfig({});
    expect(c.enabled).toBe(false);
    expect(c.smtp).toBeNull();
    expect(c.problems[0]).toMatch(/EMAIL_PROVIDER|SMTP_HOST/);
    expect(describeEmailConfig(c)).toMatch(/OFF/);
  });

  it('a provider plus a login is all it needs', () => {
    const c = resolveEmailConfig({ EMAIL_PROVIDER: 'gmail', SMTP_USER: 'school@gmail.com', SMTP_PASSWORD: 'app-password' });
    expect(c.enabled).toBe(true);
    expect(c.problems).toEqual([]);
    expect(c.smtp).toMatchObject({ host: 'smtp.gmail.com', port: 587, secure: false, user: 'school@gmail.com' });
    // Gmail only sends as the login address, so that is the default From.
    expect(c.fromAddress).toBe('school@gmail.com');
    expect(c.from).toBe('"Schovexa" <school@gmail.com>');
  });

  it('uses each provider’s own port and TLS mode', () => {
    expect(resolveEmailConfig({ EMAIL_PROVIDER: 'resend', SMTP_USER: 'resend', SMTP_PASSWORD: 're_x', EMAIL_FROM_ADDRESS: 'a@b.co' }).smtp).toMatchObject({ host: 'smtp.resend.com', port: 465, secure: true });
    expect(resolveEmailConfig({ EMAIL_PROVIDER: 'sendgrid', SMTP_USER: 'apikey', SMTP_PASSWORD: 'SG.x', EMAIL_FROM_ADDRESS: 'a@b.co' }).smtp).toMatchObject({ host: 'smtp.sendgrid.net', port: 587, secure: false });
  });

  it('explicit values beat the provider’s defaults, and empty strings count as unset', () => {
    const c = resolveEmailConfig({ EMAIL_PROVIDER: 'resend', SMTP_HOST: 'mail.school.edu', SMTP_PORT: '2525', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASSWORD: '' });
    expect(c.smtp).toMatchObject({ host: 'mail.school.edu', port: 2525, secure: false, user: null });
    const blank = resolveEmailConfig({ EMAIL_PROVIDER: 'zoho', SMTP_PORT: '', SMTP_SECURE: '', SMTP_USER: 'a@zoho.com', SMTP_PASSWORD: 'x' });
    expect(blank.smtp).toMatchObject({ port: 465, secure: true }); // docker-compose passes blanks through
  });

  it('works from a single SMTP_URL', () => {
    const c = resolveEmailConfig({ SMTP_URL: 'smtps://mailer%40school.edu:p%40ss@smtp.school.edu:465' });
    expect(c.enabled).toBe(true);
    expect(c.smtp).toMatchObject({ host: 'smtp.school.edu', port: 465, secure: true, user: 'mailer@school.edu', password: 'p@ss' });
    expect(resolveEmailConfig({ SMTP_URL: 'not a url' }).enabled).toBe(false);
  });

  it('builds the From header from its parts, or from the older SMTP_FROM', () => {
    const base = { SMTP_HOST: 'h.test' };
    expect(resolveEmailConfig({ ...base, EMAIL_FROM_NAME: 'Sunrise School', EMAIL_FROM_ADDRESS: 'office@sunrise.edu' }).from).toBe('"Sunrise School" <office@sunrise.edu>');
    expect(resolveEmailConfig({ ...base, SMTP_FROM: 'Old Name <old@school.edu>' })).toMatchObject({ fromName: 'Old Name', fromAddress: 'old@school.edu' });
    expect(resolveEmailConfig({ ...base, APP_NAME: 'Acme ERP' }).fromName).toBe('Acme ERP');
    // a quote or newline in the name can't break the header
    expect(resolveEmailConfig({ ...base, EMAIL_FROM_NAME: 'Evil"\r\nBcc: x@y.z', EMAIL_FROM_ADDRESS: 'a@b.co' }).from).not.toMatch(/[\r\n]/);
  });

  it('reads reply-to, bcc, prefix and the staging redirect', () => {
    const c = resolveEmailConfig({ SMTP_HOST: 'h.test', EMAIL_REPLY_TO: 'help@school.edu', EMAIL_BCC: 'a@x.co, b@x.co', EMAIL_SUBJECT_PREFIX: '[Sunrise]', EMAIL_REDIRECT_ALL_TO: 'me@x.co' });
    expect(c).toMatchObject({ replyTo: 'help@school.edu', bcc: ['a@x.co', 'b@x.co'], subjectPrefix: '[Sunrise]', redirectAllTo: 'me@x.co' });
    expect(describeEmailConfig(c)).toContain('redirected to me@x.co');
  });

  it('can be switched off without losing the other settings', () => {
    const c = resolveEmailConfig({ EMAIL_PROVIDER: 'gmail', SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'x', EMAIL_ENABLED: 'false' });
    expect(c.enabled).toBe(false);
    expect(c.problems.join(' ')).toMatch(/EMAIL_ENABLED/);
  });

  it('points out mistakes in plain words instead of failing mysteriously', () => {
    expect(resolveEmailConfig({ EMAIL_PROVIDER: 'gmial' }).problems.join(' ')).toMatch(/isn’t known/);
    expect(resolveEmailConfig({ SMTP_HOST: 'h.test', SMTP_USER: 'a@b.co' }).enabled).toBe(false);
    expect(resolveEmailConfig({ SMTP_HOST: 'h.test', SMTP_USER: 'a@b.co' }).problems.join(' ')).toMatch(/SMTP_PASSWORD is empty/);
    expect(resolveEmailConfig({ SMTP_HOST: 'h.test', SMTP_PORT: 'abc' }).enabled).toBe(false);
    expect(resolveEmailConfig({ SMTP_HOST: 'h.test', EMAIL_FROM_ADDRESS: 'nope' }).enabled).toBe(false);
    expect(resolveEmailConfig({ SMTP_HOST: 'h.test', EMAIL_BCC: 'good@x.co, bad' }).bcc).toEqual(['good@x.co']);
  });

  it('never puts a password in the summary or the problems', () => {
    const c = resolveEmailConfig({ EMAIL_PROVIDER: 'gmail', SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'super-secret-pw', EMAIL_BCC: 'bad' });
    expect(JSON.stringify([describeEmailConfig(c), c.problems])).not.toContain('super-secret-pw');
  });
});

describe('parseAddress', () => {
  it('reads "Name <a@b.c>" and bare addresses', () => {
    expect(parseAddress('Sunrise <a@b.co>')).toEqual({ name: 'Sunrise', address: 'a@b.co' });
    expect(parseAddress('"Sunrise School" <a@b.co>')).toEqual({ name: 'Sunrise School', address: 'a@b.co' });
    expect(parseAddress('a@b.co')).toEqual({ name: '', address: 'a@b.co' });
    expect(parseAddress('nope')).toBeNull();
  });
});
