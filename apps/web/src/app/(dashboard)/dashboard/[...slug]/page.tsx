'use client';

import { NotFoundState } from '../../../../components/error-state';

// Any /dashboard/<something-that-doesn't-exist> lands here, so the 404
// renders inside the dashboard (sidebar and header intact) instead of
// dropping the user onto a bare full-screen page.
export default function DashboardNotFound() {
  return <NotFoundState signedIn />;
}
