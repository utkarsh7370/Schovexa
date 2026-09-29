'use client';

import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Noun for the "Showing 1–12 of 87 students" summary. */
  noun?: string;
}

// 1 … 4 5 [6] 7 8 … 20 — always the first, last, and a window around the
// current page, with ellipses only where pages were actually skipped.
function pageWindow(page: number, totalPages: number): (number | 'gap-start' | 'gap-end')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | 'gap-start' | 'gap-end')[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push(i < sorted.length / 2 ? 'gap-start' : 'gap-end');
    out.push(p);
  });
  return out;
}

const NAV_BTN =
  'inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-600 transition-all ' +
  'hover:border-brand-blue/40 hover:text-brand-blue disabled:pointer-events-none disabled:opacity-40';

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48],
  noun = 'results',
}: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card sm:flex-row"
    >
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-navy">{from}–{to}</span> of{' '}
        <span className="font-semibold text-navy">{total}</span> {noun}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Per page
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-navy focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-brand-blue/15"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" className={NAV_BTN} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
              <ChevronLeftIcon size={16} />
              <span className="hidden sm:inline">Prev</span>
            </button>
            {pageWindow(page, totalPages).map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? 'page' : undefined}
                  className={[
                    'h-9 min-w-9 rounded-lg px-2 text-sm font-semibold transition-all',
                    item === page
                      ? 'bg-brand-gradient text-white shadow-glow'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-navy',
                  ].join(' ')}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="px-1 text-slate-400" aria-hidden="true">
                  …
                </span>
              ),
            )}
            <button type="button" className={NAV_BTN} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
              <span className="hidden sm:inline">Next</span>
              <ChevronRightIcon size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
