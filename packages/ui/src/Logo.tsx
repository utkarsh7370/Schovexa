// Schovexa brand mark — recreated as an inline SVG from the brand
// specification (graduation cap + stylized "S" + open book, on a
// blue-to-violet gradient). No image asset for the real logo has been
// provided to this session; swap `LogoMark`'s markup for an `<img>` /
// `next/image` pointing at the real file the moment one is available —
// every consumer of `Logo`/`LogoMark` stays unchanged either way.
//
// Brand gradient (docs: brand guidelines given in conversation, not yet
// a written doc under docs/): #00B0F0 -> #0080F0 -> #7020F0, 135deg.

import type { SVGProps } from 'react';

export interface LogoMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Symbol only — for the navbar, favicon-sized contexts, loading states. */
export function LogoMark({ size = 40, ...props }: LogoMarkProps) {
  const gradientId = 'schovexa-gradient';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Schovexa"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00B0F0" />
          <stop offset="0.5" stopColor="#0080F0" />
          <stop offset="1" stopColor="#7020F0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill={`url(#${gradientId})`} />
      {/* Open book, as the base the S rises from */}
      <path
        d="M8 27.5c3.2-1.3 6.4-1.3 9 0 2.6-1.3 5.8-1.3 9 0v2.2c-3.2-1.3-6.4-1.3-9 0-2.6-1.3-5.8-1.3-9 0v-2.2Z"
        fill="white"
        fillOpacity="0.9"
      />
      {/* Graduation cap accent, top-right */}
      <path d="M27 8.5 33 11l-6 2.5-6-2.5 6-2.5Z" fill="white" />
      <path d="M24 12.2v2.6c0 .9 1.3 1.7 3 1.7s3-.8 3-1.7v-2.6l-3 1.2-3-1.2Z" fill="white" fillOpacity="0.85" />
      {/* Stylized "S" */}
      <path
        d="M17.8 12.5c-2.8 0-4.6 1.5-4.6 3.7 0 2 1.4 3 3.9 3.6l1.1.3c1.6.4 2.1.8 2.1 1.6 0 .9-.9 1.5-2.3 1.5-1.5 0-2.5-.6-2.7-1.7h-2.7c.2 2.5 2.3 4 5.4 4 3 0 5-1.5 5-3.8 0-1.9-1.2-3-3.8-3.6l-1.1-.3c-1.5-.4-2.1-.8-2.1-1.6 0-.9.8-1.4 2.1-1.4 1.3 0 2.2.6 2.4 1.6h2.6c-.2-2.3-2.1-3.9-4.9-3.9Z"
        fill="white"
      />
    </svg>
  );
}

export interface LogoProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
}

/** Full lockup — symbol + wordmark (+ optional tagline) for auth/marketing pages. */
export function Logo({ size = 40, showTagline = false, className }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <LogoMark size={size} />
      <div className="flex flex-col justify-center">
        <span className="text-xl font-extrabold leading-tight text-navy">Schovexa</span>
        {showTagline && (
          <span className="text-xs font-medium leading-tight text-slate-500">
            Smart Schools. Better Futures.
          </span>
        )}
      </div>
    </div>
  );
}
