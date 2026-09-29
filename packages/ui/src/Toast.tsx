'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircleIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds before it dismisses itself. Default 5000. */
  duration?: number;
}

interface ToastContextValue {
  show: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastTone, { ring: string; icon: string; bar: string; Icon: typeof InfoIcon }> = {
  success: { ring: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-500', Icon: CheckCircleIcon },
  error: { ring: 'border-red-200', icon: 'bg-red-100 text-red-600', bar: 'bg-red-500', Icon: AlertCircleIcon },
  info: { ring: 'border-sky-200', icon: 'bg-sky-100 text-sky-600', bar: 'bg-sky-500', Icon: InfoIcon },
};

let nextId = 1;

// A small app-wide toast stack, replacing the old pattern of an inline
// <Alert> banner that vanished the moment a user navigated away — a
// "Student created" confirmation now survives the redirect to the new
// student's page, which is exactly when a user wants to see it. Each
// toast slides in, shows a draining progress bar so people know it will
// go away by itself, and can be dismissed early.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId++;
      const duration = toast.duration ?? 5000;
      setToasts((prev) => [...prev, { ...toast, id, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const s = STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={[
                'pointer-events-auto relative animate-slide-in-right overflow-hidden rounded-2xl border bg-white/95 shadow-elevated backdrop-blur',
                s.ring,
              ].join(' ')}
            >
              <div className="flex items-start gap-3 p-4">
                <span className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-full', s.icon].join(' ')}>
                  <s.Icon size={20} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-navy">{toast.title}</p>
                  {toast.description && <p className="mt-0.5 text-sm text-slate-500">{toast.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
                  aria-label="Dismiss notification"
                >
                  <XIcon size={16} />
                </button>
              </div>
              <div
                className={['h-1 origin-left', s.bar].join(' ')}
                style={{ animation: `shrink ${toast.duration}ms linear forwards` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
