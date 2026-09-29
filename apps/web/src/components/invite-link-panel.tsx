'use client';

import { useState } from 'react';
import { useToast } from '@schovexa/ui';
import { Check, Copy, MailCheck } from 'lucide-react';

// The success state after creating an invitation. The email goes out
// automatically when SMTP is configured; this panel also surfaces the
// link itself, with a copy button, as a dependable fallback (SMTP off,
// spam folder, or the admin simply wants to send it over WhatsApp).
export function InviteLinkPanel({ link, name }: { link: string; name?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.show({ tone: 'success', title: 'Link copied', description: 'Paste it into a message to share it.', duration: 3000 });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show({ tone: 'error', title: 'Could not copy automatically', description: 'Select the link and copy it manually.' });
    }
  };

  return (
    <div className="mt-4 animate-scale-in overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-card">
      <div className="flex items-start gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_10px_24px_-8px_rgba(16,185,129,0.6)]">
          <MailCheck size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-emerald-950">Invitation created{name ? ` for ${name}` : ''}</p>
          <p className="mt-0.5 text-sm text-emerald-900/70">
            We&apos;ve emailed the invitation if email delivery is set up. You can also share this link directly:
          </p>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs text-emerald-900" title={link}>
              {link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
