import Link from 'next/link';
import { Alert, Logo } from '@schovexa/ui';

export const metadata = { title: 'Privacy Policy — Schovexa' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="inline-block">
        <Logo size={40} />
      </Link>

      <h1 className="mt-8 text-2xl font-bold text-navy">Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: [DATE]</p>

      <Alert variant="warning" className="mt-6">
        <strong>Draft template — not legal advice.</strong> This is a starting point written to describe what
        Schovexa&apos;s software actually does, not a policy reviewed by a lawyer. Because this product stores{' '}
        <strong>students&apos; personal data, and students are typically minors</strong>, have this reviewed against
        the laws of every jurisdiction your schools operate in (e.g. FERPA and COPPA in the US, GDPR in the EU/UK,
        India&apos;s DPDP Act 2023) before relying on it. Replace every <code>[bracketed placeholder]</code> below.
      </Alert>

      <Section title="1. Who this policy covers">
        <p>
          Schovexa (&quot;we&quot;, &quot;us&quot;) provides school management software to schools (&quot;Schools&quot;) on a multi-tenant
          basis. Each School is the <strong>data controller</strong> for the student, parent, and staff data it
          enters into Schovexa; Schovexa acts as a <strong>data processor</strong>, handling that data only on the
          School&apos;s instructions and for the purpose of providing the service. If you are a parent, student, or
          staff member with questions about your data, your School — not Schovexa — is usually the right first point
          of contact, since they control what&apos;s in the system.
        </p>
      </Section>

      <Section title="2. What data we process">
        <ul className="list-disc pl-5">
          <li>
            <strong>Account data:</strong> name, email, password (stored as a salted hash, never in plain text),
            role, and login session activity.
          </li>
          <li>
            <strong>Student records:</strong> name, date of birth, gender, admission number, class/section,
            enrollment status, and any documents a School uploads (e.g. report cards, ID proofs).
          </li>
          <li>
            <strong>Parent/guardian data:</strong> name, phone, email, and relationship to linked students.
          </li>
          <li>
            <strong>Attendance and academic data:</strong> daily attendance records marked by staff.
          </li>
          <li>
            <strong>Fee and payment data:</strong> fee amounts, due dates, and manually recorded payment history.
            Schovexa does not itself process card or bank payments in this version of the product.
          </li>
          <li>
            <strong>Usage data:</strong> IP address, browser/device information, and access logs, kept for security
            and audit purposes (see docs/logging.md and the in-app audit log).
          </li>
        </ul>
      </Section>

      <Section title="3. How we use this data">
        <p>
          Strictly to operate the service a School has signed up for: authenticating users, enforcing each
          person&apos;s permissions, displaying records back to authorized staff/parents/students, sending
          transactional emails (invitations, password resets), and maintaining audit logs for security. We do not
          sell personal data, and we do not use student or parent data for advertising.
        </p>
      </Section>

      <Section title="4. Who we share data with">
        <p>
          Only the infrastructure providers needed to run the service, acting as our own sub-processors under
          contract, for example:
        </p>
        <ul className="list-disc pl-5">
          <li>A database/hosting provider (e.g. [HOSTING PROVIDER]).</li>
          <li>An object storage provider for uploaded documents (e.g. [STORAGE PROVIDER]).</li>
          <li>An email delivery provider for transactional email (e.g. [EMAIL PROVIDER]).</li>
          <li>An error-monitoring provider (Sentry), which receives error diagnostics — not general user data.</li>
        </ul>
        <p>
          We never sell personal data to third parties, and we don&apos;t share it across Schools — each
          School&apos;s data is isolated from every other School using Schovexa.
        </p>
      </Section>

      <Section title="5. Children's data">
        <p>
          Much of the data in this system concerns students, most of whom are minors. Schovexa is built for use by
          Schools acting on behalf of, and with the consent frameworks required of, the educational institution
          (commonly relied on as a &quot;school official&quot; exception under laws like FERPA, where applicable) —
          it is the School&apos;s responsibility to have the appropriate legal basis and, where required, parental
          consent for the student data it enters. <strong>This section in particular needs a lawyer&apos;s
          review</strong> for the specific jurisdictions your Schools operate in.
        </p>
      </Section>

      <Section title="6. Data retention and deletion">
        <p>
          Data is retained for as long as a School&apos;s account is active, plus a reasonable period after (for
          legal/audit retention — see the school&apos;s own record-keeping obligations) unless a School requests
          earlier deletion. Soft-deleted records (marked inactive) remain recoverable for a period before permanent
          removal; see [RETENTION PERIOD] for specifics once set.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          Passwords are hashed (never stored in plain text), all traffic is encrypted in transit, access to every
          record is scoped by role-based permissions enforced on every request, and every meaningful action is
          recorded in an audit log. No system is perfectly secure; see [SECURITY CONTACT] to report a vulnerability.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, or request deletion of your
          personal data. Because Schovexa acts as a processor, these requests should generally go to your School
          first; Schovexa will assist Schools in fulfilling verified requests.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We&apos;ll update the &quot;Last updated&quot; date above when this policy changes, and notify Schools of
          material changes via [NOTIFICATION METHOD].
        </p>
      </Section>

      <Section title="10. Contact">
        <p>Questions about this policy: [CONTACT EMAIL].</p>
      </Section>
    </main>
  );
}
