'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@schovexa/ui';
import { ArrowLeft, Compass, Home, LayoutDashboard, LockKeyhole, RefreshCw, ServerCrash } from 'lucide-react';

type Tone = 'blue' | 'amber' | 'red';

const TONES: Record<Tone, { code: string; tile: string; glow: string }> = {
  blue: {
    code: 'from-brand-electric via-brand-blue to-brand-violet',
    tile: 'from-brand-electric to-brand-blue shadow-glow',
    glow: 'bg-brand-electric/25',
  },
  amber: {
    code: 'from-amber-400 via-orange-500 to-rose-500',
    tile: 'from-amber-400 to-orange-500 shadow-[0_10px_30px_-8px_rgba(245,158,11,0.55)]',
    glow: 'bg-amber-400/25',
  },
  red: {
    code: 'from-rose-400 via-red-500 to-red-700',
    tile: 'from-rose-400 to-red-500 shadow-[0_10px_30px_-8px_rgba(239,68,68,0.55)]',
    glow: 'bg-red-400/25',
  },
};

export interface ErrorStateProps {
  code: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: Tone;
  actions?: ReactNode;
  /** Small monospace line, e.g. an error reference the user can quote to support. */
  reference?: string;
  /** Fill the whole screen (root 404 / crash pages) instead of sitting inside the dashboard. */
  fullScreen?: boolean;
}

// One layout for every "something is not right" screen — 404, 403 and
// 500 all read as the same product, always saying what happened, whose
// fault it (probably) is, and what to do next.
export function ErrorState({ code, title, description, icon, tone = 'blue', actions, reference, fullScreen = false }: ErrorStateProps) {
  const t = TONES[tone];
  return (
    <div
      className={[
        'relative isolate flex flex-col items-center justify-center overflow-hidden px-6 text-center',
        fullScreen ? 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50' : 'min-h-[60vh] py-12',
      ].join(' ')}
      role="alert"
    >
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden="true" />
      <div className={['pointer-events-none absolute -z-10 h-72 w-72 animate-blob rounded-full blur-3xl', t.glow].join(' ')} aria-hidden="true" />

      <span className={['flex h-16 w-16 animate-float items-center justify-center rounded-2xl bg-gradient-to-br text-white', t.tile].join(' ')}>{icon}</span>
      <p className={['mt-6 animate-fade-in-up bg-gradient-to-r bg-clip-text text-8xl font-black leading-none tracking-tighter text-transparent sm:text-9xl', t.code].join(' ')}>
        {code}
      </p>
      <h1 className="mt-4 animate-fade-in-up text-2xl font-extrabold tracking-tight text-navy [animation-delay:80ms] sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-md animate-fade-in-up text-slate-600 [animation-delay:140ms]">{description}</p>
      {actions && <div className="mt-8 flex animate-fade-in-up flex-wrap items-center justify-center gap-3 [animation-delay:200ms]">{actions}</div>}
      {reference && <p className="mt-6 font-mono text-xs text-slate-400">Reference: {reference}</p>}
    </div>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={() => router.back()}>
      <ArrowLeft size={16} /> Go back
    </Button>
  );
}

export function NotFoundState({ fullScreen = false, signedIn = false }: { fullScreen?: boolean; signedIn?: boolean }) {
  return (
    <ErrorState
      code="404"
      tone="blue"
      fullScreen={fullScreen}
      icon={<Compass size={30} />}
      title="We couldn’t find that page"
      description="The link may be broken, or the page may have moved. Check the address, or head back somewhere familiar."
      actions={
        <>
          <BackButton />
          <Link href={signedIn ? '/dashboard' : '/'}>
            <Button>
              {signedIn ? <LayoutDashboard size={16} /> : <Home size={16} />} {signedIn ? 'Go to dashboard' : 'Go to homepage'}
            </Button>
          </Link>
        </>
      }
    />
  );
}

export function ForbiddenState({ fullScreen = false, detail }: { fullScreen?: boolean; detail?: string }) {
  return (
    <ErrorState
      code="403"
      tone="amber"
      fullScreen={fullScreen}
      icon={<LockKeyhole size={30} />}
      title="You don’t have access to this page"
      description={
        detail ??
        'Your role doesn’t include this area. If you think that’s a mistake, ask your school administrator to update your access.'
      }
      actions={
        <>
          <BackButton />
          <Link href="/dashboard">
            <Button>
              <LayoutDashboard size={16} /> Go to dashboard
            </Button>
          </Link>
        </>
      }
    />
  );
}

export function ServerErrorState({ fullScreen = false, onRetry, reference }: { fullScreen?: boolean; onRetry?: () => void; reference?: string }) {
  return (
    <ErrorState
      code="500"
      tone="red"
      fullScreen={fullScreen}
      icon={<ServerCrash size={30} />}
      title="Something went wrong on our side"
      description="It’s not you — an unexpected error stopped this page from loading. Please try again; if it keeps happening, contact support and quote the reference below."
      reference={reference}
      actions={
        <>
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw size={16} /> Try again
            </Button>
          )}
          <Link href="/">
            <Button variant="secondary">
              <Home size={16} /> Go to homepage
            </Button>
          </Link>
        </>
      }
    />
  );
}
