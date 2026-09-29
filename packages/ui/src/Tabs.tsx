'use client';

import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small count chip next to the label. */
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

// Pill tabs with roving keyboard focus (←/→/Home/End). Panels are the
// caller's job — render whichever content matches `value` and give it
// `role="tabpanel"` + `aria-labelledby={`tab-${id}`}`.
export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) :
      e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) :
      e.key === 'Home' ? 0 :
      e.key === 'End' ? last : null;
    if (target === null) return;
    e.preventDefault();
    const next = tabs[target];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      className={['flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-card', className ?? ''].join(' ')}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={[
              'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200',
              active
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'text-slate-500 hover:bg-slate-100 hover:text-navy',
            ].join(' ')}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 text-[11px] font-bold leading-5',
                  active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
