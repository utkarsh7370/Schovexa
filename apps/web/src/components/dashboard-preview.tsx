import { Bell, CalendarCheck, IdCard, LayoutDashboard, Users, Wallet, CheckCircle2, TrendingUp } from 'lucide-react';

// A pure-CSS mock of the real dashboard, used as the homepage hero
// visual — no screenshot asset to go stale, and it always matches the
// brand. Two small cards float around it to give the hero depth.
export function DashboardPreview() {
  const nav = [
    { icon: LayoutDashboard, active: true },
    { icon: IdCard },
    { icon: CalendarCheck },
    { icon: Wallet },
    { icon: Users },
  ];
  const bars = [46, 62, 54, 78, 68, 90, 84];

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-brand-gradient opacity-20 blur-3xl" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_30px_80px_-20px_rgba(0,16,64,0.35)] ring-1 ring-slate-900/5">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 h-5 w-48 rounded-md bg-slate-200/70" />
        </div>

        <div className="flex">
          <div className="hidden w-14 shrink-0 flex-col items-center gap-3 bg-brand-gradient-dark py-4 sm:flex">
            {nav.map((n, i) => (
              <span
                key={i}
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-xl',
                  n.active ? 'bg-white/15 text-white ring-1 ring-white/30' : 'text-white/50',
                ].join(' ')}
              >
                <n.icon size={17} />
              </span>
            ))}
          </div>

          <div className="flex-1 bg-slate-50/70 p-4 sm:p-5">
            <div className="h-3 w-40 rounded bg-navy/80" />
            <div className="mt-1.5 h-2 w-56 rounded bg-slate-300/70" />

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Students', value: '1,248', tone: 'from-sky-50 to-white', icon: 'from-brand-electric to-brand-blue' },
                { label: 'Present today', value: '96%', tone: 'from-emerald-50 to-white', icon: 'from-emerald-400 to-emerald-600' },
                { label: 'Fees due', value: '₹3.6L', tone: 'from-violet-50 to-white', icon: 'from-brand-blue to-brand-violet' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl border border-slate-200/80 bg-gradient-to-br p-3 ${s.tone}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${s.icon}`} />
                  <p className="mt-2 text-lg font-extrabold leading-none text-navy">{s.value}</p>
                  <p className="mt-1 text-[10px] font-medium text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200/80 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-navy">Weekly attendance</p>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <TrendingUp size={11} /> +4.2%
                </span>
              </div>
              <div className="mt-2 flex h-16 items-end gap-2">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-blue to-brand-electric" style={{ height: `${h}%`, opacity: 0.55 + i * 0.06 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-0 top-16 hidden animate-float items-center gap-3 rounded-2xl border border-white/70 bg-white/90 p-3 pr-5 shadow-elevated backdrop-blur lg:flex lg:-left-28">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={20} />
        </span>
        <div>
          <p className="text-xs font-bold text-navy">Attendance marked</p>
          <p className="text-[11px] text-slate-500">Grade 5-A · 32 students</p>
        </div>
      </div>

      <div className="absolute right-0 bottom-16 hidden animate-float-delayed items-center gap-3 rounded-2xl border border-white/70 bg-white/90 p-3 pr-5 shadow-elevated backdrop-blur lg:flex lg:-right-24">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Bell size={20} />
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-amber-400" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </span>
        </span>
        <div>
          <p className="text-xs font-bold text-navy">New notice</p>
          <p className="text-[11px] text-slate-500">Annual day rehearsal</p>
        </div>
      </div>
    </div>
  );
}
