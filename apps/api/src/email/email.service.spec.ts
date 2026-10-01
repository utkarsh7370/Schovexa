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
        from: 'Schovexa <no-reply@schovexa.app>',
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
});
