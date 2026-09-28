'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-green-200 bg-white',
  error: 'border-red-200 bg-white',
  info: 'border-slate-200 bg-white',
};

const DOT_CLASSES: Record<ToastTone, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-sky-500',
};

let nextId = 1;

// A small app-wide toast stack, replacing the old pattern of an inline
// <Alert> banner that vanished the moment a user navigated away — a
// "Student created" confirmation now survives the redirect to the new
// student's page, which is exactly when a user wants to see it.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={[
              'pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-elevated',
              TONE_CLASSES[toast.tone],
            ].join(' ')}
          >
            <span className={['mt-1 h-2 w-2 shrink-0 rounded-full', DOT_CLASSES[toast.tone]].join(' ')} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-navy">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-sm text-slate-500">{toast.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
