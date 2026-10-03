'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Skeleton, useToast } from '@schovexa/ui';
import { ArrowLeft, Download, Printer, Send } from 'lucide-react';
import { useReceipt } from '../../../../../hooks/useFinance';
import { useCan } from '../../../../../hooks/useCan';
import { api, ApiError, downloadFile } from '../../../../../lib/api-client';
import { formatMinor } from '../../../../../lib/currency';
import { formatDay } from '../../../../../components/finance/finance-ui';

function ReceiptView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const { data: receipt, isLoading, isError } = useReceipt(id);
  const [busy, setBusy] = useState<'print' | 'pdf' | 'send' | null>(null);
  const printedOnce = useRef(false);

  const print = async () => {
    setBusy('print');
    try {
      // Counted and logged on the server: every copy after the first is a "reprint".
      await api.post(`/receipts/${id}/reprint`);
      await queryClient.invalidateQueries({ queryKey: ['finance', 'receipt', id] });
      window.print();
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not print', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  // Arriving from "Print receipt" right after collecting a payment: open the print dialog once.
  useEffect(() => {
    if (receipt && params.get('print') === '1' && !printedOnce.current) {
      printedOnce.current = true;
      const timer = window.setTimeout(() => void print(), 400);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  const download = async () => {
    setBusy('pdf');
    try {
      await downloadFile(`/receipts/${id}/pdf`, `receipt-${receipt?.receiptNo ?? id}.pdf`);
      await queryClient.invalidateQueries({ queryKey: ['finance', 'receipt', id] });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not download the receipt', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('send');
    try {
      const result = await api.post<{ reached: number; unreachable: number }>(`/receipts/${id}/notify`);
      toast.show(
        result.reached > 0
          ? { tone: 'success', title: 'Receipt sent', description: `Delivered to ${result.reached} ${result.reached === 1 ? 'parent' : 'parents'}.` }
          : { tone: 'info', title: 'Nobody could be reached', description: 'The parent has no portal account or email address on file, or has turned notifications off.' },
      );
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not send the receipt', description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert variant="error">We couldn’t find that receipt.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="print:hidden">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-blue">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-navy">Receipt</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={print} loading={busy === 'print'} disabled={!receipt}>
              <Printer size={16} /> {receipt && receipt.reprintCount > 0 ? 'Reprint' : 'Print'}
            </Button>
            <Button variant="secondary" onClick={download} loading={busy === 'pdf'} disabled={!receipt}>
              <Download size={16} /> Download PDF
            </Button>
            {can('feeNotice.send') && (
              <Button variant="secondary" onClick={send} loading={busy === 'send'} disabled={!receipt}>
                <Send size={16} /> Send to parent
              </Button>
            )}
          </div>
        </div>
        {receipt && receipt.reprintCount > 0 && <p className="mt-2 text-xs text-slate-500">Printed again {receipt.reprintCount} time{receipt.reprintCount === 1 ? '' : 's'}.</p>}
      </div>

      <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8 print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none" aria-label="Fee receipt">
        {isLoading || !receipt ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <header className="border-b border-dashed border-slate-300 pb-5 text-center">
              <h2 className="text-xl font-extrabold text-navy">{receipt.school.name}</h2>
              {receipt.school.address && <p className="mt-1 text-sm text-slate-500">{receipt.school.address}</p>}
              {(receipt.school.phone || receipt.school.email) && <p className="text-sm text-slate-500">{[receipt.school.phone, receipt.school.email].filter(Boolean).join(' · ')}</p>}
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Fee receipt</p>
            </header>

            <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
              <p>
                Receipt no. <span className="font-mono text-base font-bold text-navy">{receipt.receiptNo}</span>
              </p>
              <p className="text-slate-600">Date: <span className="font-semibold text-navy">{formatDay(receipt.payment.paidAt)}</span></p>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                ['Student', receipt.student.name],
                ['Admission no.', receipt.student.admissionNo],
                ['Class', receipt.student.className ? `${receipt.student.className}${receipt.student.sectionName ? ` – ${receipt.student.sectionName}` : ''}` : '—'],
                ['Parent / guardian', receipt.student.parentName ?? '—'],
                ['Fee', receipt.fee.category],
                ['Payment method', receipt.payment.methodLabel],
                ['Received from', receipt.payment.receivedFrom ?? '—'],
                ['Reference', receipt.payment.reference ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-navy">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Fee billed</span><span>{formatMinor(receipt.fee.amountDueMinor)}</span></div>
              {receipt.fee.discountMinor > 0 && <div className="flex justify-between"><span className="text-slate-500">Discounts</span><span>− {formatMinor(receipt.fee.discountMinor)}</span></div>}
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-navy">Amount received</span>
                <span className="text-2xl font-extrabold text-emerald-700">{formatMinor(receipt.payment.amountMinor)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600">
                <span>Balance remaining on this fee</span>
                <span className="font-semibold">{formatMinor(receipt.balanceMinor)}</span>
              </div>
            </div>

            {receipt.payment.note && <p className="mt-4 text-sm text-slate-600">Note: {receipt.payment.note}</p>}
            {receipt.payment.corrected && <p className="mt-3"><Badge tone="warning">This payment was corrected after it was recorded</Badge></p>}

            <footer className="mt-8 flex items-end justify-between text-xs text-slate-500">
              <p>Collected by {receipt.payment.collectedBy ?? '—'}</p>
              <p className="text-right">
                <span className="mb-1 block h-px w-40 bg-slate-300" />
                Authorised signature
              </p>
            </footer>
            <p className="mt-6 text-center text-[11px] text-slate-400">This is a computer-generated receipt.</p>
          </>
        )}
      </article>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-2xl" />}>
      <ReceiptView />
    </Suspense>
  );
}
