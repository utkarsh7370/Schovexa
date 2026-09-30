import { NextResponse, type NextRequest } from 'next/server';

// Copies the visitor's country — which the hosting edge already works
// out and sends as a request header — into a cookie the browser can read,
// so the header flag and the default pricing market need no third-party
// geo-IP lookup. Country only (never the IP), and nothing is stored on
// our servers. Where the app isn't behind such an edge (local dev,
// plain Docker) the header is absent, this does nothing, and the client
// falls back to the browser's time zone and language.
const COUNTRY_COOKIE = 'sv_country';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const raw = request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry') ?? '';
  const country = raw.toUpperCase();
  // Cloudflare uses XX (unknown) and T1 (Tor) as pseudo-countries.
  const valid = /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1';

  if (valid && request.cookies.get(COUNTRY_COOKIE)?.value !== country) {
    response.cookies.set(COUNTRY_COOKIE, country, {
      path: '/',
      maxAge: THIRTY_DAYS,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}

export const config = {
  // Pages only — skip API calls, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
