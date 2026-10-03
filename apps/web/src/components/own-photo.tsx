'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@schovexa/ui';
import { api, ApiError } from '../lib/api-client';
import { StudentPhoto } from './student-photo';
import { CURRENT_USER_QUERY_KEY } from '../hooks/useCurrentUser';
import { MY_PROFILE_QUERY_KEY } from '../hooks/useProfile';

/** The signed-in person's own photo, with change and remove controls (JPEG or PNG, up to 2 MB). */
export function OwnPhoto({ name, photoUrl, size = 96 }: { name: string; photoUrl: string | null; size?: number }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY }), queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }), queryClient.invalidateQueries({ queryKey: ['photo'] })]);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.postForm('/me/photo', form);
      await refresh();
      toast.show({ tone: 'success', title: 'Photo updated' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not upload the photo', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete('/me/photo');
      await refresh();
      toast.show({ tone: 'success', title: 'Photo removed' });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not remove the photo', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="animate-scale-in rounded-full shadow-glow ring-4 ring-white">
        <StudentPhoto name={name} photoUrl={photoUrl} size={size} />
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Upload your photo" onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex gap-2 text-[11px] font-semibold">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-full bg-white/15 px-2.5 py-1 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 disabled:opacity-50">
          {photoUrl ? 'Change photo' : 'Add photo'}
        </button>
        {photoUrl && (
          <button type="button" disabled={busy} onClick={remove} className="rounded-full bg-white/10 px-2.5 py-1 text-white/80 ring-1 ring-inset ring-white/20 hover:bg-white/20 disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
