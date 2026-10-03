import type { ReactNode } from 'react';
import Link from 'next/link';
import { Avatar } from '@schovexa/ui';
import { ArrowLeft } from 'lucide-react';

export interface ProfileChip {
  icon: ReactNode;
  label: string;
}

export interface ProfileHeroProps {
  backHref: string;
  backLabel: string;
  name: string;
  /** Small line under the name (admission number, "Parent / Guardian", …). */
  subtitle?: ReactNode;
  /** Status badges rendered on the eyebrow row. */
  badges?: ReactNode;
  chips?: ProfileChip[];
  /** Right-hand controls (status selector, invite button, …). */
  actions?: ReactNode;
  /** Replaces the initials avatar (a photo, say). */
  avatar?: ReactNode;
}

// The banner both profile pages (student, parent) open with: dark brand
// gradient, big ringed avatar, name, status badges, fact chips and an
// action slot — so a profile reads as "a person", not a form.
export function ProfileHero({ backHref, backLabel, name, subtitle, badges, chips = [], actions, avatar }: ProfileHeroProps) {
  return (
    <div>
      <Link
        href={backHref}
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-navy"
      >
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> {backLabel}
      </Link>

      <div className="relative mt-3 overflow-hidden rounded-3xl bg-brand-gradient-dark text-white shadow-elevated">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 animate-blob rounded-full bg-brand-electric/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 animate-blob rounded-full bg-brand-violet/30 blur-3xl [animation-delay:4s]" aria-hidden="true" />

        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          {avatar ?? <Avatar name={name} tone="auto" size={96} ring className="animate-scale-in shadow-glow" />}
          <div className="min-w-0 flex-1 animate-fade-in-up">
            {badges && <div className="mb-2 flex flex-wrap items-center gap-2">{badges}</div>}
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{name}</h1>
            {subtitle && <div className="mt-1 text-sm font-medium text-white/70">{subtitle}</div>}
            {chips.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li
                    key={chip.label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur"
                  >
                    {chip.icon}
                    {chip.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-start">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
