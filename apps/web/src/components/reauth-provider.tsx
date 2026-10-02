'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, TextField } from '@schovexa/ui';
import { Lock, ShieldCheck } from 'lucide-react';
import { api, ApiError, setReauthHandler } from '../lib/api-client';

// "Confirm it's you": shown when the server asks for the password again
// before a sensitive action. The request that triggered it waits here and
// carries on — or fails with the original refusal — depending on the answer.
export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  const ask = useCallback(() => {
    // Several requests can be refused at once; they all share one dialog.
    if (pending.current) return pending.current.promise;
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    pending.current = { promise, resolve };
    setPassword('');
    setError(null);
    setOpen(true);
    return promise;
  }, []);

  useEffect(() => {
    setReauthHandler(ask);
    return () => setReauthHandler(null);
  }, [ask]);

  const finish = (ok: boolean) => {
    setOpen(false);
    pending.current?.resolve(ok);
    pending.current = null;
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reauth', { password });
      finish(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not confirm your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      <Dialog
        open={open}
        onClose={() => finish(false)}
        title="Confirm it’s you"
        description="This is a sensitive change, so please enter your password to continue."
        eyebrow={<ShieldCheck size={18} className="text-brand-blue" />}
      >
        <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            autoFocus
            leftIcon={<Lock size={16} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!password}>
              Confirm
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
