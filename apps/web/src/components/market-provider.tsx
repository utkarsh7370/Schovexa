'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectCountry, isMarketCode, marketForCountry, MARKET_STORAGE_KEY, type CountrySource, type MarketCode } from '../lib/market';

interface MarketState {
  /** Detected two-letter country (null until detection runs, or if it can't tell). */
  country: string | null;
  source: CountrySource;
  /** The pricing market in effect: the visitor's choice, else derived from `country`. */
  market: MarketCode;
  /** True when the visitor picked the market themselves. */
  chosen: boolean;
  setMarket: (market: MarketCode) => void;
}

const MarketContext = createContext<MarketState | null>(null);

// Detection runs after mount, never during render: the server has no
// idea where the visitor is, and rendering a different market on the
// client than the server sent would be a hydration mismatch. The first
// paint is the India default; a US visitor sees it switch a moment later.
export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountry] = useState<string | null>(null);
  const [source, setSource] = useState<CountrySource>('none');
  const [override, setOverride] = useState<MarketCode | null>(null);

  useEffect(() => {
    const detected = detectCountry();
    setCountry(detected.country);
    setSource(detected.source);
    try {
      const saved = window.localStorage.getItem(MARKET_STORAGE_KEY);
      if (isMarketCode(saved)) setOverride(saved);
    } catch {
      /* storage blocked (private window) — detection alone is fine */
    }
  }, []);

  const setMarket = useCallback((market: MarketCode) => {
    setOverride(market);
    try {
      window.localStorage.setItem(MARKET_STORAGE_KEY, market);
    } catch {
      /* not persisted, still applied for this visit */
    }
  }, []);

  const value = useMemo<MarketState>(
    () => ({ country, source, market: override ?? marketForCountry(country), chosen: override !== null, setMarket }),
    [country, source, override, setMarket],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketState {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside <MarketProvider>');
  return ctx;
}
