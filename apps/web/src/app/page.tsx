import Link from 'next/link';
import { Logo, Button } from '@schovexa/ui';

const FEATURES = [
  { title: 'Administration', description: 'Schools, staff, roles and permissions in one place.' },
  { title: 'Academics', description: 'Classes, sections, subjects and academic years.' },
  { title: 'Attendance & Fees', description: 'Daily attendance and fee collection, tracked accurately.' },
  { title: 'Communication', description: 'Notices that reach the right people, every time.' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-navy hover:underline">
            Log in
          </Link>
          <Link href="/register">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 py-20 text-center">
        <h1 className="bg-gradient-to-br from-brand-electric via-brand-blue to-brand-violet bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          Run Your School Smarter.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          One connected platform for school administration, teachers, students and parents.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/register">
            <Button size="lg">Get Started</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              Log in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-navy">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Schovexa.</p>
          <div className="flex gap-4">
            <Link href="/privacy-policy" className="hover:text-navy hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="hover:text-navy hover:underline">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
