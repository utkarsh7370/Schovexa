'use client';

import { PageHeader } from '@schovexa/ui';
import { FinanceDashboard } from '../../../../components/finance/finance-dashboard';

export default function FinancePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Finance" title="Finance dashboard" description="What came in today, what is still owed, and what needs a decision." />
      <div className="mt-6">
        <FinanceDashboard />
      </div>
    </div>
  );
}
