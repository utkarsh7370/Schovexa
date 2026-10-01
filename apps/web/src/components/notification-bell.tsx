'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck, Inbox } from 'lucide-react';
import { api } from '../lib/api-client';
import { NOTIFICATIONS_QUERY_KEY, useNotifications, type Notification } from '../hooks/useNotices';

function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The header bell: a count of what's new, and a dropdown of the latest
// notifications. Clicking one marks it read and goes where it points
// (a system notification's link, or the Notices page for a notice).
export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  const unread = notifications?.filter((n) => !n.readAt).length ?? 0;
  const latest = (notifications ?? []).slice(0, 8);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

  const openNotification = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) {
      // Optimistic: the badge drops immediately; the server call follows.
      queryClient.setQueryData<Notification[]>(NOTIFICATIONS_QUERY_KEY, (prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      try {
        await api.post(`/notifications/${n.id}/read`);
      } finally {
        refresh();
      }
    }
    router.push(n.link ?? '/dashboard/notices');
  };

  const markAll = async () => {
    queryClient.setQueryData<Notification[]>(NOTIFICATIONS_QUERY_KEY, (prev) => prev?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    try {
      await api.post('/notifications/read-all');
    } finally {
      refresh();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-card transition-all hover:border-brand-blue/40 hover:text-brand-blue hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        {unread > 0 ? <BellRing size={17} className="origin-top animate-wiggle text-brand-blue" /> : <Bell size={17} />}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" aria-label="Notifications" className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevated">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-navy">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {latest.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Inbox size={20} />
              </span>
              <p className="text-sm font-semibold text-navy">You’re all caught up</p>
              <p className="text-xs text-slate-500">Approvals, alerts and updates will show up here.</p>
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {latest.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openNotification(n)}
                    className={['flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none', n.readAt ? '' : 'bg-brand-blue/[0.04]'].join(' ')}
                  >
                    <span className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-blue'].join(' ')} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={['block text-sm text-navy', n.readAt ? 'font-medium' : 'font-bold'].join(' ')}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{n.body}</span>
                      <span className="mt-1 block text-[11px] font-medium text-slate-400">{timeAgo(n.createdAt, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 px-4 py-2.5 text-center">
            <Link href="/dashboard/notices" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-blue hover:underline">
              Go to notices
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
