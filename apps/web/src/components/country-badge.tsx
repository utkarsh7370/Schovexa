'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { CountryFlag } from './country-flag';
import { useMarket } from './market-provider';
import { countryName, type MarketCode } from '../lib/market';

const MARKETS: { code: MarketCode; name: string; currency: string }[] = [
  { code: 'IN', name: 'India', currency: '₹ INR' },
  { code: 'US', name: 'United States', currency: '$ USD' },
];

// The country in the header. On the marketing site it shows where the
// visitor is (detected, never asked for) and is a small menu so they can
// switch price lists. Signed in, pass `schoolCountry`: the badge then shows
// where *the school* is — not where this browser happens to be — and has
// nothing to switch.
export function CountryBadge({ interactive = false, schoolCountry }: { interactive?: boolean; schoolCountry?: string | null }) {
  const { country, market, chosen, source, setMarket } = useMarket();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The flag reflects the market in effect (so choosing "United States"
  // changes it); otherwise the detected country, which may be one we
  // don't sell in yet and so shows a globe.
  const shownCode = schoolCountry ?? (chosen ? market : country);
  // A name, not a two-letter code: "India" says more than "IN".
  const label = shownCode ? countryName(shownCode) : 'Location unknown';
  const detectedText = country ? `Detected location: ${countryName(country)}` : 'Location not detected';

  if (!interactive) {
    return (
      <span
        className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-navy shadow-card"
        title={schoolCountry ? `School location: ${label}` : detectedText}
      >
        <CountryFlag code={shownCode} size={20} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{label}</span>
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Region: ${label}. Change region`}
        title={detectedText}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-navy shadow-card transition-all hover:border-brand-blue/40 hover:shadow-elevated"
      >
        <CountryFlag code={shownCode} size={20} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{label}</span>
        <ChevronDown size={14} className={['text-slate-400 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 origin-top-right animate-scale-in rounded-2xl border border-slate-200 bg-white p-1.5 shadow-elevated">
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Pricing region</p>
          {MARKETS.map((m) => (
            <button
              key={m.code}
              role="menuitemradio"
              aria-checked={market === m.code}
              onClick={() => {
                setMarket(m.code);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50"
            >
              <CountryFlag code={m.code} size={24} />
              <span className="flex-1">
                <span className="block font-semibold text-navy">{m.name}</span>
                <span className="block text-xs text-slate-500">{m.currency}</span>
              </span>
              {market === m.code && <Check size={16} className="text-brand-blue" />}
            </button>
          ))}
          <p className="border-t border-slate-100 px-3 pb-2 pt-2.5 text-xs text-slate-500">
            {detectedText}
            {country && source !== 'none' && (
              <span className="text-slate-400"> ({source === 'server' ? 'from your network' : source === 'timezone' ? 'from your time zone' : 'from your browser language'})</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
