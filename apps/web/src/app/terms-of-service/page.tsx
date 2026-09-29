import Link from 'next/link';
import { Alert, Logo } from '@schovexa/ui';

export const metadata = { title: 'Terms of Service — Schovexa' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="inline-block">
        <Logo size={40} />
      </Link>

      <h1 className="mt-8 text-2xl font-bold text-navy">Terms of Service</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: [DATE]</p>

      <Alert variant="warning" className="mt-6">
        <strong>Draft template — not legal advice.</strong> Have a lawyer review this before real Schools rely on it,
        especially the liability, data-ownership, and termination sections. Replace every{' '}
        <code>[bracketed placeholder]</code> — including the company name, jurisdiction, and contact details — with
        real values.
      </Alert>

      <Section title="1. Acceptance of these terms">
        <p>
          By creating a School account or using Schovexa (&quot;the Service&quot;) in any capacity — as a school
          administrator, teacher, staff member, or parent — you agree to these Terms on behalf of yourself and, if
          you&apos;re registering a School, on behalf of that School.
        </p>
      </Section>

      <Section title="2. What the Service is">
        <p>
          Schovexa is school-management software: student records, attendance, fee tracking, staff/role management,
          and related communication tools, provided on a subscription basis to Schools (&quot;Customers&quot;).
          Individual teachers, parents, and students access the Service as authorized users under a School&apos;s
          account, not as independent Schovexa customers.
        </p>
      </Section>

      <Section title="3. Accounts and responsibilities">
        <ul className="list-disc pl-5">
          <li>
            The School is responsible for the accuracy of the data it enters and for obtaining any consents (e.g.
            from parents) required by law to store that data in the Service.
          </li>
          <li>
            The School&apos;s administrator(s) are responsible for granting roles/permissions appropriately —
            Schovexa enforces whatever permissions the School configures, but does not decide who should have them.
          </li>
          <li>Each user is responsible for keeping their own login credentials confidential and for all activity under their account.</li>
        </ul>
      </Section>

      <Section title="4. Acceptable use">
        <p>You (and anyone using an account under your School) agree not to:</p>
        <ul className="list-disc pl-5">
          <li>Access or attempt to access another School&apos;s data, or any account you&apos;re not authorized to use.</li>
          <li>
            Use the Service to store or transmit unlawful content, or to harass, defame, or discriminate against any
            student, parent, or staff member.
          </li>
          <li>Attempt to circumvent rate limits, authentication, or the permission system.</li>
          <li>Reverse-engineer, resell, or provide third-party access to the Service outside your own School&apos;s authorized users.</li>
        </ul>
      </Section>

      <Section title="5. Fees and payment">
        <p>
          [PRICING MODEL — e.g. &quot;Schools pay a per-student or per-month subscription fee, billed
          [monthly/annually] via [PAYMENT PROCESSOR].&quot;] Fees are non-refundable except as required by law or
          stated otherwise in a separate agreement with the School.
        </p>
      </Section>

      <Section title="6. Data ownership">
        <p>
          The School owns the data it enters into the Service (student records, attendance, fees, etc.). Schovexa
          processes that data solely to provide the Service, per our{' '}
          <Link href="/privacy-policy" className="text-brand-blue underline">
            Privacy Policy
          </Link>
          , and does not claim ownership of it. On termination, the School may request an export of its data within
          [EXPORT WINDOW] before it is deleted per our data retention practices.
        </p>
      </Section>

      <Section title="7. Termination">
        <p>
          Either party may terminate a School&apos;s subscription per the terms of their order form or [NOTICE
          PERIOD] written notice. We may suspend access immediately for a material breach of these Terms (e.g.
          unlawful use, non-payment) after reasonable notice where practical.
        </p>
      </Section>

      <Section title="8. Disclaimers and limitation of liability">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, TO THE
          MAXIMUM EXTENT PERMITTED BY LAW. [LIABILITY CAP — e.g. &quot;Our total liability for any claim arising
          from the Service is limited to the fees paid by the School in the 12 months preceding the
          claim.&quot;] This section needs specific, jurisdiction-aware legal drafting — the placeholder above is
          illustrative only.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>These Terms are governed by the laws of [JURISDICTION], without regard to conflict-of-law principles.</p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>
          We&apos;ll update the &quot;Last updated&quot; date above when these Terms change and notify Schools of
          material changes via [NOTIFICATION METHOD].
        </p>
      </Section>

      <Section title="11. Contact">
        <p>Questions about these Terms: [CONTACT EMAIL].</p>
      </Section>
    </main>
  );
}
