'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ConfirmDialog, Skeleton, useToast } from '@schovexa/ui';
import { History, Laptop, LogOut, MonitorSmartphone, ShieldAlert, Smartphone } from 'lucide-react';
import { api, ApiError } from '../lib/api-client';
import { timeAgo } from '../lib/time';
import { SECURITY_ACTIVITY_QUERY_KEY, SESSIONS_QUERY_KEY, useSecurityActivity, useSessions, type DeviceSession } from '../hooks/useSecurity';
import { SectionCard } from './section-card';

const isPhone = (d: DeviceSession) => /iOS|Android/.test(d.device.os);

// Where this account is signed in, with a way to end any session that
// isn't the person's own — the answer to "I lost my phone".
export function DevicesPanel() {
  const { data: sessions, isLoading, isError } = useSessions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<DeviceSession | 'all' | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: SECURITY_ACTIVITY_QUERY_KEY });
  };

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (target === 'all') {
        const res = await api.post<{ revoked: number }>('/auth/sessions/revoke-others');
        toast.show({ tone: 'success', title: 'Signed out everywhere else', description: `${res.revoked} other ${res.revoked === 1 ? 'session was' : 'sessions were'} ended.` });
      } else {
        await api.delete(`/auth/sessions/${target.id}`);
        toast.show({ tone: 'success', title: 'Device signed out', description: target.device.label });
      }
      setTarget(null);
      refresh();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not sign out', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const others = sessions?.filter((s) => !s.current) ?? [];

  return (
    <SectionCard
      icon={<MonitorSmartphone size={18} />}
      title="Devices & sessions"
      description="Where you’re signed in right now. Not you? Sign that device out and change your password."
      action={
        others.length > 0 ? (
          <Button variant="soft-danger" size="sm" onClick={() => setTarget('all')}>
            <LogOut size={15} /> Sign out all other devices
          </Button>
        ) : undefined
      }
    >
      {isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && <p className="text-sm text-red-600">We couldn’t load your devices. Please refresh.</p>}
      <ul className="divide-y divide-slate-100">
        {sessions?.map((s) => {
          const Icon = isPhone(s) ? Smartphone : Laptop;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                  {s.device.label}
                  {s.current && <Badge tone="success" dot>This device</Badge>}
                  {s.rememberMe && <Badge tone="info">Kept signed in</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  Active {timeAgo(s.lastSeenAt)} · signed in {timeAgo(s.createdAt)}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                </p>
              </div>
              {!s.current && (
                <Button variant="secondary" size="sm" onClick={() => setTarget(s)}>
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={target !== null}
        tone="danger"
        loading={busy}
        title={target === 'all' ? 'Sign out all other devices?' : 'Sign this device out?'}
        description={
          target === 'all'
            ? 'Every session except this one ends immediately. You’ll need to log in again on those devices.'
            : target
              ? `${target.device.label} will be signed out immediately.`
              : undefined
        }
        confirmLabel="Sign out"
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </SectionCard>
  );
}

// Recent sign-ins, failed attempts and password changes on this account —
// the "was that me?" list.
export function SecurityActivityPanel() {
  const { data: events, isLoading, isError } = useSecurityActivity();
  return (
    <SectionCard icon={<History size={18} />} title="Recent security activity" description="Sign-ins, failed attempts and password changes on your account.">
      {isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && <p className="text-sm text-red-600">We couldn’t load your activity. Please refresh.</p>}
      {events && events.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
      <ul className="divide-y divide-slate-100">
        {events?.slice(0, 15).map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', e.alert ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'].join(' ')}>
              {e.alert ? <ShieldAlert size={17} /> : <History size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy">{e.label}</p>
              <p className="truncate text-xs text-slate-500">
                {[e.device, e.ipAddress].filter(Boolean).join(' · ') || 'Unknown device'}
              </p>
            </div>
            <time className="shrink-0 text-xs text-slate-400" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
              {timeAgo(e.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
