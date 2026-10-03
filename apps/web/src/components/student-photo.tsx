'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@schovexa/ui';
import { api } from '../lib/api-client';

/** A student's photo, fetched through the signed-in session (never a public URL); initials until it loads or when there is none. */
export function StudentPhoto({ name, photoUrl, size = 40 }: { name: string; photoUrl: string | null | undefined; size?: number }) {
  const { data } = useQuery({
    queryKey: ['photo', photoUrl],
    queryFn: async () => (await api.blob(photoUrl as string)).blob,
    enabled: !!photoUrl,
    staleTime: 5 * 60_000,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data]);

  if (!objectUrl) return <Avatar name={name} tone="auto" size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
}
