'use client';

import { useCurrentUser } from '../hooks/useCurrentUser';
import { NotFoundState } from './error-state';

// Root 404. Signed-in visitors are pointed back at their dashboard, the
// rest at the homepage.
export function NotFoundPage() {
  const { data: me } = useCurrentUser();
  return <NotFoundState fullScreen signedIn={!!me} />;
}
