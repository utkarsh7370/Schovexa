import Link from 'next/link';
import { Logo } from '@schovexa/ui';
import { CalendarCheck, ShieldCheck, Wallet, Sparkles } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: 'Attendance in seconds', text: 'Mark a whole class in one tap and see trends instantly.' },
  { icon: Wallet, title: 'Fees without the chaos', text: 'Structures, payments, receipts and balances in one place.' },
  { icon: ShieldCheck, title: 'Built to keep data safe', text: 'Role-based access and a full audit trail for every school.' },
];

// Every auth screen shares this split layout: a brand panel that sells
// the product on the left (desktop only) and the form on the right. The
// forms themselves stay simple; the polish lives here once.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-gradient-dark text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 animate-blob rounded-full bg-brand-electric/35 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-80 w-80 animate-blob rounded-full bg-brand-violet/45 blur-3xl [animation-delay:-6s]" aria-hidden="true" />

        <Link href="/" className="relative w-fit">
          <Logo tone="light" size={42} />
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-inset ring-white/20 backdrop-blur">
            <Sparkles size={14} /> Smart Schools. Better Futures.
          </span>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
            Run your whole school
            <br />
            <span className="bg-gradient-to-r from-brand-electric to-white bg-clip-text text-transparent">from one calm place.</span>
          </h2>
          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((h, i) => (
              <li key={h.title} className="flex animate-fade-in-up gap-4" style={{ animationDelay: `${200 + i * 140}ms` }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur">
                  <h.icon size={20} />
                </span>
                <div>
                  <p className="font-semibold">{h.title}</p>
                  <p className="text-sm text-white/65">{h.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">&copy; {new Date().getFullYear()} Schovexa. All rights reserved.</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-10 sm:px-8">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
        <Link href="/" className="relative mb-8 lg:hidden">
          <Logo size={40} />
        </Link>
        <div className="relative w-full max-w-md animate-fade-in-up">{children}</div>
        <p className="relative mt-8 text-xs text-slate-400">
          <Link href="/privacy-policy" className="hover:text-slate-600 hover:underline">
            Privacy Policy
          </Link>
          {' · '}
          <Link href="/terms-of-service" className="hover:text-slate-600 hover:underline">
            Terms of Service
          </Link>
        </p>
      </main>
    </div>
  );
}
