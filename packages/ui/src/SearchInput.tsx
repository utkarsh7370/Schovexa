'use client';

import type { InputHTMLAttributes } from 'react';
import { SearchIcon, XIcon } from './icons';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Shows a subtle spinner while a search request is in flight. */
  busy?: boolean;
}

// One search box for every list: icon, clear button, Esc-to-clear, and
// a busy indicator — so "type to filter" feels the same on Students,
// Parents, Staff and anywhere else it's used.
export function SearchInput({ value, onChange, busy = false, className, placeholder = 'Search…', ...props }: SearchInputProps) {
  return (
    <div className={['group relative', className ?? ''].join(' ')}>
      <SearchIcon
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-blue"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        className={[
          'h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400',
          'transition-all duration-200 hover:border-slate-300 focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-brand-blue/15',
          '[&::-webkit-search-cancel-button]:hidden',
        ].join(' ')}
        {...props}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        {busy ? (
          <span className="mr-1.5 block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-blue" aria-hidden="true" />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="animate-fade-in rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
              aria-label="Clear search"
            >
              <XIcon size={16} />
            </button>
          )
        )}
      </div>
    </div>
  );
}
