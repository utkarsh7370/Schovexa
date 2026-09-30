// Where the visitor is → which pricing market they see first, and which
// flag the header shows. Three signals, best first, none of which send
// the visitor's IP to a third party:
//   1. the country header the hosting edge adds (Vercel / Cloudflare),
//      copied into a cookie by middleware.ts
//   2. the browser's time zone
//   3. the browser's language region (en-IN, en-US…)
// A market the visitor picks by hand always wins over all of these.

export type MarketCode = 'IN' | 'US';

export const COUNTRY_COOKIE = 'sv_country';
export const MARKET_STORAGE_KEY = 'sv_market';

export type CountrySource = 'server' | 'timezone' | 'locale' | 'none';

const INDIA_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);
const US_ZONE_PREFIXES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Adak', 'America/Detroit', 'America/Boise', 'America/Juneau', 'America/Indiana/', 'America/Kentucky/', 'Pacific/Honolulu'];

// India gets India pricing; everyone else gets the US (USD) price list
// until more markets exist; a visitor we can't place at all sees India
// first, our home market.
export function marketForCountry(country: string | null): MarketCode {
  if (!country) return 'IN';
  return country === 'IN' ? 'IN' : 'US';
}

export function isMarketCode(value: unknown): value is MarketCode {
  return value === 'IN' || value === 'US';
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function fromCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([A-Za-z]{2})(?:;|$)`));
  return match ? match[1].toUpperCase() : null;
}

function fromTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (INDIA_ZONES.has(zone)) return 'IN';
    if (US_ZONE_PREFIXES.some((p) => zone === p || zone.startsWith(p))) return 'US';
  } catch {
    /* Intl unavailable — fall through to the next signal */
  }
  return null;
}

function fromLocale(): string | null {
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const region = tag?.split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  }
  return null;
}

export function detectCountry(): { country: string | null; source: CountrySource } {
  const server = fromCookie();
  if (server) return { country: server, source: 'server' };
  const zone = fromTimezone();
  if (zone) return { country: zone, source: 'timezone' };
  const locale = fromLocale();
  if (locale) return { country: locale, source: 'locale' };
  return { country: null, source: 'none' };
}
