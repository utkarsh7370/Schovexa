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

// IANA time zone → ISO country, for the zones people actually live in. The
// zone is the best signal the browser gives us without asking permission or
// calling a third-party geo service. Zones not listed fall through to the
// browser's language region.
const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Thimphu': 'BT',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH', 'Asia/Hong_Kong': 'HK', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL', 'Asia/Baghdad': 'IQ', 'Asia/Kabul': 'AF',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL',
  'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
  'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Accra': 'GH',
  'Africa/Addis_Ababa': 'ET', 'Africa/Casablanca': 'MA', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
  'America/Lima': 'PE', 'America/Santiago': 'CL',
};
const US_ZONE_PREFIXES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Adak', 'America/Detroit', 'America/Boise', 'America/Juneau', 'America/Indiana/', 'America/Kentucky/', 'Pacific/Honolulu'];

// Countries a school can be in, for the settings picker. Any ISO code is
// accepted by the API; this is the short list people actually choose from.
export const COUNTRY_OPTIONS = [
  'IN', 'US', 'GB', 'AE', 'CA', 'AU', 'SG', 'NZ', 'IE', 'PK', 'BD', 'LK', 'NP', 'SA', 'QA', 'KW', 'OM', 'BH', 'MY', 'ID', 'TH',
  'VN', 'PH', 'HK', 'CN', 'JP', 'KR', 'FR', 'DE', 'ES', 'IT', 'NL', 'CH', 'SE', 'NO', 'ZA', 'NG', 'KE', 'GH', 'EG', 'BR', 'MX', 'AR',
];

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
    if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
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
