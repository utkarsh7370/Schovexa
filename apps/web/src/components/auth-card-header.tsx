import type { ReactNode } from 'react';

// The consistent top of every auth card: a gradient icon tile, a title,
// and one line of context — so login, register, reset and invite screens
// all read as one product.
export function AuthCardHeader({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
        {icon}
      </div>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-navy">{title}</h1>
      {description && <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>}
    </div>
  );
}
