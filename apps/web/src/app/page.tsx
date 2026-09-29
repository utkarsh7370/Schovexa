import Link from 'next/link';
import { Logo, Button, Reveal } from '@schovexa/ui';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarCheck,
  Check,
  GraduationCap,
  IdCard,
  KeyRound,
  Rocket,
  ShieldCheck,
  UserPlus2,
  Users,
  Wallet,
  School,
  HeartHandshake,
  Calculator,
} from 'lucide-react';
import { DashboardPreview } from '../components/dashboard-preview';

const FEATURES = [
  {
    icon: IdCard,
    title: 'Student management',
    description: 'Admissions, profiles, guardians and documents — every student record in one searchable place.',
    tone: 'from-brand-electric to-brand-blue',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance',
    description: 'Mark a whole section in seconds, correct mistakes, and see daily and monthly summaries instantly.',
    tone: 'from-emerald-400 to-emerald-600',
  },
  {
    icon: Wallet,
    title: 'Fees & receipts',
    description: 'Build fee structures, record payments, issue receipts and always know who still owes what.',
    tone: 'from-amber-400 to-orange-500',
  },
  {
    icon: Bell,
    title: 'Notices & alerts',
    description: 'Publish announcements to the whole school, a class or one person — with read tracking.',
    tone: 'from-brand-blue to-brand-violet',
  },
  {
    icon: BarChart3,
    title: 'Reports & CSV export',
    description: 'Student, attendance and fee reports with filters and one-click CSV downloads for offline use.',
    tone: 'from-sky-400 to-cyan-600',
  },
  {
    icon: ShieldCheck,
    title: 'Roles & security',
    description: 'Role-based access, per-school data isolation and a complete audit trail of who did what.',
    tone: 'from-violet-500 to-fuchsia-600',
  },
];

const STEPS = [
  {
    icon: School,
    title: 'Register your school',
    description: 'Create your workspace and director account in about a minute. No installation, no setup fee.',
  },
  {
    icon: UserPlus2,
    title: 'Invite your team',
    description: 'Add teachers, accountants and front-desk staff by email, each with exactly the access their role needs.',
  },
  {
    icon: Rocket,
    title: 'Run daily operations',
    description: 'Take attendance, collect fees, publish notices and keep parents informed — all from one dashboard.',
  },
];

const AUDIENCES = [
  {
    icon: KeyRound,
    role: 'School directors',
    points: ['A live view of students, staff and fees', 'Full control over roles and permissions', 'Reports ready to export'],
  },
  {
    icon: GraduationCap,
    role: 'Teachers',
    points: ['Mark attendance for your own classes', 'See only the students you teach', 'Read school notices in one place'],
  },
  {
    icon: Calculator,
    role: 'Accountants',
    points: ['Fee structures and assignments', 'Record payments and issue receipts', 'Outstanding balances at a glance'],
  },
  {
    icon: HeartHandshake,
    role: 'Parents',
    points: ["See your child's attendance and fees", 'Get notices from the school instantly', 'Secure, private, always available'],
  },
];

const TRUST = ['No installation needed', 'Each school’s data stays isolated', 'Works on phone, tablet and desktop'];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="Schovexa home">
            <Logo size={36} />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex" aria-label="Sections">
            <a href="#features" className="transition-colors hover:text-brand-blue">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-brand-blue">How it works</a>
            <a href="#who-its-for" className="transition-colors hover:text-brand-blue">Who it&apos;s for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-100">
              Log in
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate">
        <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden="true" />
        <div className="absolute -left-24 top-0 -z-10 h-96 w-96 animate-blob rounded-full bg-brand-electric/25 blur-3xl" aria-hidden="true" />
        <div className="absolute -right-24 top-24 -z-10 h-[26rem] w-[26rem] animate-blob rounded-full bg-brand-violet/20 blur-3xl [animation-delay:-7s]" aria-hidden="true" />

        <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex animate-fade-in-up items-center gap-2 rounded-full bg-brand-blue/10 px-4 py-1.5 text-xs font-semibold text-brand-blue ring-1 ring-inset ring-brand-blue/20">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-brand-blue" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-blue" />
              </span>
              School management software, made simple
            </span>
            <h1 className="mt-6 animate-fade-in-up text-5xl font-extrabold leading-[1.05] tracking-tight text-navy [animation-delay:80ms] sm:text-6xl lg:text-7xl">
              Run your school
              <br />
              <span className="bg-gradient-to-r from-brand-electric via-brand-blue to-brand-violet bg-[length:200%_100%] bg-clip-text text-transparent animate-gradient-x">
                smarter, not harder.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl animate-fade-in-up text-lg leading-8 text-slate-600 [animation-delay:160ms]">
              Schovexa is a modern cloud platform that brings student records, attendance, fee collection, staff and parent
              communication into one secure workspace — so your team spends less time on paperwork and more time on students.
            </p>
            <div className="mt-9 flex animate-fade-in-up flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:flex-row">
              <Link href="/register">
                <Button size="lg">
                  Register your school <ArrowRight size={18} />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="secondary">
                  Log in to your school
                </Button>
              </Link>
            </div>
            <ul className="mt-8 flex animate-fade-in-up flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500 [animation-delay:320ms]">
              {TRUST.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={16} className="text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-16 animate-fade-in-up [animation-delay:400ms]">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="border-y border-slate-100 bg-slate-50/70">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-blue">What is Schovexa?</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
              One platform for everything that happens in a school.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Most schools juggle spreadsheets, paper registers and chat groups. Schovexa replaces that patchwork with a single
              system where every role sees exactly what they need — nothing more, nothing less.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                'Multi-school ready, with data isolated per school',
                'Role-based access for every staff member',
                'Parents get their own secure portal',
                'Audit trail for every important action',
                'Export reports to CSV in one click',
                'Fast on any device, nothing to install',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-navy shadow-card">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-blue">Features</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Everything your school needs, connected.</h2>
          <p className="mt-4 text-slate-600">Powerful where it counts, simple everywhere else.</p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-2 hover:border-brand-blue/30 hover:shadow-elevated">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-gradient opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20" aria-hidden="true" />
                <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${f.tone}`}>
                  <f.icon size={22} />
                </span>
                <h3 className="relative mt-5 text-lg font-bold text-navy">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-6 text-slate-600">{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden bg-brand-gradient-dark py-24 text-white">
        <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 top-0 h-80 w-80 animate-blob rounded-full bg-brand-electric/25 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-electric">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Up and running in three steps.</h2>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <div className="relative h-full rounded-2xl border border-white/15 bg-white/[0.07] p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.11]">
                  <span className="absolute right-6 top-5 text-5xl font-extrabold text-white/10">{i + 1}</span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
                    <s.icon size={22} />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{s.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-blue">Who it&apos;s for</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Built for everyone in your school community.</h2>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.role} delay={i * 90}>
              <div className="h-full rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-elevated">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                  <a.icon size={22} />
                </span>
                <h3 className="mt-4 text-base font-bold text-navy">{a.role}</h3>
                <ul className="mt-3 space-y-2">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <Reveal>
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-gradient bg-[length:200%_200%] px-8 py-16 text-center text-white shadow-glow animate-gradient-x sm:px-16">
            <div className="bg-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/15 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <Users className="mx-auto opacity-90" size={34} />
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to bring your school together?</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/85">
                Create your school&apos;s workspace today and invite your team in minutes.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/register">
                  <button className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-base font-bold text-navy shadow-elevated transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-10px_rgba(0,0,0,0.4)] active:scale-[0.98]">
                    Get started free <ArrowRight size={18} />
                  </button>
                </Link>
                <Link href="/login" className="rounded-xl px-6 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/40 transition-colors hover:bg-white/10">
                  I already have an account
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50/70 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <span className="hidden text-slate-400 sm:inline">·</span>
            <p>&copy; {new Date().getFullYear()} Schovexa. All rights reserved.</p>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy-policy" className="hover:text-navy hover:underline">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-navy hover:underline">Terms of Service</Link>
            <Link href="/login" className="hover:text-navy hover:underline">Log in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
