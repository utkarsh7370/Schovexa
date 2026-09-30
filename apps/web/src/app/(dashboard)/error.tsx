'use client';

import { RouteError } from '../../components/route-error';

// Inside the dashboard the sidebar and header stay put; only the page
// area shows the error.
export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} />;
}
