import nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

describe('EmailService', () => {
  const originalEnv = { ...process.env };
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is not configured and does not send when SMTP_HOST is unset', async () => {
    delete process.env.SMTP_HOST;
    const service = new EmailService();

    expect(service.isConfigured).toBe(false);
    await expect(service.send({ to: 'a@example.test', subject: 'Hi', text: 'hi', html: '<p>hi</p>' })).resolves.toBe(false);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends through the configured SMTP transport', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_FROM = 'Schovexa <no-reply@schovexa.app>';
    const service = new EmailService();

    expect(service.isConfigured).toBe(true);
    await expect(
      service.send({ to: 'a@example.test', subject: 'Welcome', text: 'hi', html: '<p>hi</p>', replyTo: 'b@example.test' }),
    ).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Schovexa" <no-reply@schovexa.app>',
        to: 'a@example.test',
        subject: 'Welcome',
        replyTo: 'b@example.test',
      }),
    );
  });

  it('never throws when the provider fails — the caller does not depend on delivery succeeding', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    sendMail.mockRejectedValue(new Error('connection refused'));
    const service = new EmailService();

    await expect(
      service.send({ to: 'a@example.test', subject: 'Hi', text: 'hi', html: '<p>hi</p>' }),
    ).resolves.toBe(false);
  });

  it('applies the configured prefix, reply-to default, bcc and staging redirect', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.EMAIL_SUBJECT_PREFIX = '[Sunrise]';
    process.env.EMAIL_REPLY_TO = 'help@school.test';
    process.env.EMAIL_BCC = 'audit@school.test';
    const service = new EmailService();
    await service.send({ to: 'parent@example.test', subject: 'Hello\r\nBcc: evil@x.test', text: 't', html: 'h' });
    expect(sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'parent@example.test', subject: '[Sunrise] Hello Bcc: evil@x.test', replyTo: 'help@school.test', bcc: ['audit@school.test'] }),
    );

    // a caller's own reply-to (the contact form visitor) wins
    await service.send({ to: 'a@example.test', subject: 'S', text: 't', html: 'h', replyTo: 'visitor@example.test' });
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ replyTo: 'visitor@example.test' }));

    process.env.EMAIL_REDIRECT_ALL_TO = 'me@school.test';
    const staging = new EmailService();
    await staging.send({ to: 'parent@example.test', subject: 'Fee due', text: 't', html: 'h' });
    const call = sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
    expect(call.to).toBe('me@school.test');
    expect(call.subject).toContain('[for parent@example.test]');
    expect(call.bcc).toBeUndefined();
  });

  it('is off when EMAIL_ENABLED is false', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.EMAIL_ENABLED = 'false';
    const service = new EmailService();
    expect(service.isConfigured).toBe(false);
    await expect(service.send({ to: 'a@example.test', subject: 'Hi', text: 't', html: 'h' })).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
