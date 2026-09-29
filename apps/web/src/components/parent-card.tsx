'use client';

import Link from 'next/link';
import { Avatar, Badge } from '@schovexa/ui';
import { ArrowUpRight, Mail, Phone } from 'lucide-react';
import type { Parent } from '../hooks/useParents';

export function ParentCard({ parent, index = 0 }: { parent: Parent; index?: number }) {
  const fullName = `${parent.firstName} ${parent.lastName}`;
  const kids = parent.children;
  const shown = kids.slice(0, 3);

  return (
    <Link
      href={`/dashboard/parents/${parent.id}`}
      className="group relative block animate-fade-in-up rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <article className="relative h-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-blue/30 group-hover:shadow-elevated">
        <div className={['h-1.5 bg-gradient-to-r', parent.userId ? 'from-emerald-400 to-teal-500' : 'from-slate-200 to-slate-300'].join(' ')} />
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-gradient-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar name={fullName} tone="auto" size={52} className="shadow-card transition-transform duration-300 group-hover:scale-105" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-navy">{fullName}</p>
                <p className="text-xs font-medium text-slate-500">Parent / Guardian</p>
              </div>
            </div>
            <Badge tone={parent.userId ? 'success' : 'neutral'} dot>
              {parent.userId ? 'Portal active' : 'No login'}
            </Badge>
          </div>

          <ul className="mt-5 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-brand-blue">
                <Phone size={14} />
              </span>
              <span className="truncate">{parent.phone ?? <span className="text-slate-400">No phone</span>}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-brand-violet">
                <Mail size={14} />
              </span>
              <span className="truncate">{parent.email ?? <span className="text-slate-400">No email</span>}</span>
            </li>
          </ul>

          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5">
            {kids.length > 0 ? (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {shown.map((c) => (
                    <Avatar key={c.id} name={`${c.student.firstName} ${c.student.lastName}`} tone="auto" size={26} ring />
                  ))}
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {kids.length} {kids.length === 1 ? 'child' : 'children'}
                </span>
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-400">No children linked</span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue opacity-70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
              View profile <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
