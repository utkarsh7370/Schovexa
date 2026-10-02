// Checks the email settings in your environment (.env) end to end:
//   npm run email:test -w @schovexa/api -- you@example.com
// Prints what email is set to do (never a password), logs in to the mail
// server, and — if you give an address — sends a real test message.
import 'dotenv/config';
import { EmailService } from '../src/email/email.service';
import { appName, appUrl } from '../src/email/branding';

async function main() {
  const to = process.argv[2];
  const email = new EmailService();
  console.log(`\n${email.summary}\n`);
  // When email is off, the first problem is already the end of the summary line above.
  for (const problem of email.problems.slice(email.isConfigured ? 0 : 1)) console.log(`  • ${problem}`);

  if (!email.isConfigured) {
    console.log('\nNothing was sent. Add the email variables to .env (see .env.example) and run this again.\n');
    process.exit(1);
  }

  process.stdout.write('\nLogging in to the mail server… ');
  const check = await email.verify();
  if (!check.ok) {
    console.log(`FAILED\n  ${check.error}\n  Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASSWORD.\n`);
    process.exit(1);
  }
  console.log('OK');

  if (!to) {
    console.log('\nLogin works. Add an address to send a test message:  npm run email:test -w @schovexa/api -- you@example.com\n');
    return;
  }
  const sent = await email.send({
    to,
    subject: `Test email from ${appName()}`,
    text: `This is a test email from ${appName()}. If you can read it, email is set up correctly.\n\n${appUrl()}`,
    html: `<p>This is a test email from <strong>${appName()}</strong>.</p><p>If you can read it, email is set up correctly.</p><p><a href="${appUrl()}">${appUrl()}</a></p>`,
  });
  console.log(sent ? `\nSent to ${to}. Check the inbox (and spam).\n` : `\nThe mail server refused the message — see the error above.\n`);
  process.exit(sent ? 0 : 1);
}

void main();
