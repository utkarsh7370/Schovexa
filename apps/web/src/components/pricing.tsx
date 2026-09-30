'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Reveal, Tabs } from '@schovexa/ui';
import { ArrowRight, BadgeCheck, Check, Info, Mail, Sparkles, Users } from 'lucide-react';
import { CountryFlag } from './country-flag';
import { useMarket } from './market-provider';
import { annualSaving, formatPrice, INCLUDED_FEATURES, MARKETS, type Market, type Plan } from '../lib/pricing';
import type { MarketCode } from '../lib/market';

// Where "Contact sales" / "Talk to us" go. Set NEXT_PUBLIC_SALES_EMAIL to
// your real address; the fallback is a placeholder, not a mailbox we know exists.
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? 'sales@schovexa.com';

type Billing = 'annual' | 'monthly';

function PlanCard({ plan, market, billing, index }: { plan: Plan; market: Market; billing: Billing; index: number }) {
  const custom = plan.monthly === null || plan.annual === null;
  const saving = annualSaving(plan);
  const dark = plan.id === 'enterprise';
  const price = billing === 'annual' ? plan.annual : plan.monthly;

  const cta = plan.cta.kind === 'trial' ? '/register' : `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`${plan.name} plan enquiry (${market.name})`)}`;
  const ctaClass = plan.popular
    ? 'bg-brand-gradient bg-[length:160%_100%] text-white shadow-glow hover:bg-right hover:shadow-[0_14px_34px_-8px_rgba(0,128,240,0.7)]'
    : dark
      ? 'bg-white text-navy hover:bg-slate-100'
      : 'border border-slate-200 bg-white text-navy shadow-card hover:border-brand-blue/40 hover:bg-slate-50';

  const inner = (
    <div
      className={[
        'relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300',
        dark ? 'bg-brand-gradient-dark text-white' : 'bg-white',
        plan.popular ? 'shadow-elevated' : dark ? 'shadow-card' : 'border border-slate-200 shadow-card hover:-translate-y-1.5 hover:border-brand-blue/30 hover:shadow-elevated',
      ].join(' ')}
    >
      {dark && <div className="bg-grid-light pointer-events-none absolute inset-0 rounded-2xl" aria-hidden="true" />}
      {plan.popular && (
        <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-navy px-3 py-1 text-xs font-bold text-white shadow-elevated">
          <Sparkles size={12} className="text-amber-300" /> Most popular
        </span>
      )}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold">{plan.name}</h3>
        </div>
        <p className={['mt-1 text-sm', dark ? 'text-white/65' : 'text-slate-500'].join(' ')}>{plan.tagline}</p>

        <div className="mt-6 min-h-[7.25rem]">
          {custom ? (
            <>
              <p className="text-4xl font-extrabold tracking-tight">Custom</p>
              <p className="mt-2 text-sm text-white/65">Priced around your schools and branches.</p>
            </>
          ) : (
            // Re-keyed on every toggle so the price cross-fades instead of snapping.
            <div key={`${billing}-${market.code}`} className="animate-fade-in-up">
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-navy">{formatPrice(market, price ?? 0)}</span>
                <span className="text-sm font-medium text-slate-500">/{billing === 'annual' ? 'year' : 'month'}</span>
              </p>
              {billing === 'annual' && plan.annual !== null ? (
                <p className="mt-1.5 text-sm text-slate-500">≈ {formatPrice(market, Math.round(plan.annual / 12))} / month, billed yearly</p>
              ) : (
                plan.annual !== null && <p className="mt-1.5 text-sm text-slate-500">or {formatPrice(market, plan.annual)} / year</p>
              )}
              {saving && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {billing === 'annual' ? `You save ${formatPrice(market, saving.amount)} (${saving.percent}%)` : `Save ${formatPrice(market, saving.amount)} with annual billing`}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">{market.taxNote}</p>
            </div>
          )}
        </div>

        <ul className={['mt-6 space-y-2.5 border-t pt-5 text-sm', dark ? 'border-white/15' : 'border-slate-100'].join(' ')}>
          <li className="flex items-start gap-2 font-semibold">
            <Users size={16} className={['mt-0.5 shrink-0', dark ? 'text-brand-electric' : 'text-brand-blue'].join(' ')} /> {plan.studentsLabel}
          </li>
          {['Unlimited teachers, admins & parents', 'Every module included'].map((point) => (
            <li key={point} className={['flex items-start gap-2', dark ? 'text-white/80' : 'text-slate-600'].join(' ')}>
              <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" /> {point}
            </li>
          ))}
          {plan.id === 'enterprise' && (
            <li className="flex items-start gap-2 text-white/80">
              <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" /> Multi-branch &amp; group reporting
            </li>
          )}
        </ul>

        <div className="mt-auto pt-6">
          {plan.cta.kind === 'trial' ? (
            <Link href={cta} className={['inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]', ctaClass].join(' ')}>
              {plan.cta.label} <ArrowRight size={16} />
            </Link>
          ) : (
            <a href={cta} className={['inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]', ctaClass].join(' ')}>
              <Mail size={16} /> {plan.cta.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Reveal delay={index * 70} className="h-full">
      {plan.popular ? (
        <div className="h-full rounded-[1.15rem] bg-brand-gradient bg-[length:200%_200%] p-[2px] shadow-glow animate-gradient-x xl:-translate-y-3">{inner}</div>
      ) : (
        inner
      )}
    </Reveal>
  );
}

export function Pricing() {
  const { market: code, setMarket } = useMarket();
  const [billing, setBilling] = useState<Billing>('annual');
  const market = MARKETS[code];

  return (
    <section id="pricing" className="relative scroll-mt-20 overflow-hidden border-y border-slate-100 bg-gradient-to-b from-slate-50 via-white to-sky-50/50 py-24">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-blue">Pricing</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Simple pricing. Everything your school needs.</h2>
          <p className="mt-4 text-slate-600">
            One subscription per school, priced by student count. Unlimited teachers, admins and parents in every plan — no per-user fees to worry about.
          </p>
        </Reveal>

        <div className="mt-10 flex flex-col items-center gap-5">
          <Tabs
            value={code}
            onChange={(id) => setMarket(id as MarketCode)}
            tabs={(Object.keys(MARKETS) as MarketCode[]).map((c) => ({
              id: c,
              label: `${MARKETS[c].name} · ${MARKETS[c].currency}`,
              icon: <CountryFlag code={c} size={20} />,
            }))}
          />

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-card" role="group" aria-label="Billing period">
              {(['monthly', 'annual'] as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={billing === b}
                  onClick={() => setBilling(b)}
                  className={[
                    'rounded-full px-5 py-2 text-sm font-semibold capitalize transition-all duration-200',
                    billing === b ? 'bg-navy text-white shadow-card' : 'text-slate-500 hover:text-navy',
                  ].join(' ')}
                >
                  {b}
                  {b === 'annual' && <span className={['ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold', billing === 'annual' ? 'bg-emerald-400 text-navy' : 'bg-emerald-50 text-emerald-700'].join(' ')}>Save ~17%</span>}
                </button>
              ))}
            </div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <BadgeCheck size={17} className="text-emerald-500" /> 30-day free trial · No credit card required
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-stretch">
          {market.plans.map((plan, i) => (
            <PlanCard key={`${market.code}-${plan.id}`} plan={plan} market={market} billing={billing} index={i} />
          ))}
        </div>

        {market.implementation && (
          <Reveal>
            <p className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-900">
              <Info size={18} className="mt-0.5 shrink-0 text-brand-blue" /> {market.implementation}
            </p>
          </Reveal>
        )}

        <div className="mt-16 grid gap-6 lg:grid-cols-5">
          <Reveal className="lg:col-span-3">
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
              <h3 className="text-lg font-extrabold text-navy">Included in every plan</h3>
              <p className="mt-1 text-sm text-slate-500">The only thing that changes between plans is how many students your school has.</p>
              <ul className="mt-5 grid gap-x-6 gap-y-2.5 text-sm text-slate-700 sm:grid-cols-2">
                {INCLUDED_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={100} className="lg:col-span-2">
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
              <h3 className="text-lg font-extrabold text-navy">Optional add-ons</h3>
              <p className="mt-1 text-sm text-slate-500">Things that cost us money per use are billed at cost, so your subscription stays flat.</p>
              <dl className="mt-5 divide-y divide-slate-100 text-sm">
                {market.addOns.map((a) => (
                  <div key={a.name} className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="font-medium text-navy">{a.name}</dt>
                    <dd className="text-right text-slate-500">{a.price}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
