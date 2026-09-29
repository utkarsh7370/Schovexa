'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Dialog } from '@schovexa/ui';
import { Bell, CalendarDays, ChevronRight, Megaphone, Users } from 'lucide-react';
import { NOTICES_QUERY_KEY, type Notice, type NoticeAudience } from '../hooks/useNotices';
import { api } from '../lib/api-client';

export const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  ALL_SCHOOL: 'Whole school',
  CLASS: 'A class',
  SECTION: 'A section',
  INDIVIDUAL: 'One person',
};

function formatDate(iso: string, withTime = false): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

// One place that owns "open a notice in the modal and mark it read", so
// the dashboard and the Notices page behave identically. Render `dialog`
// once anywhere in the page and call `open(notice)` from any card.
export function useNoticeViewer() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Notice | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(
    async (notice: Notice) => {
      setSelected(notice);
      setIsOpen(true);
      if (notice.publishedAt && !notice.isRead) {
        try {
          await api.post(`/notices/${notice.id}/read`);
          await queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY });
        } catch {
          // Reading still works if marking-as-read fails; it retries next open.
        }
      }
    },
    [queryClient],
  );

  const dialog = <NoticeDialog notice={selected} open={isOpen} onClose={() => setIsOpen(false)} />;
  return { open, dialog };
}

export function NoticeDialog({ notice, open, onClose }: { notice: Notice | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={notice?.title ?? ''}
      eyebrow={
        notice && (
          <>
            <Badge tone="brand">
              <Users size={12} /> {AUDIENCE_LABELS[notice.audienceType]}
            </Badge>
            {!notice.publishedAt && <Badge tone="neutral">Draft</Badge>}
          </>
        )
      }
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      {notice && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <CalendarDays size={14} />
            {notice.publishedAt ? `Published ${formatDate(notice.publishedAt, true)}` : `Created ${formatDate(notice.createdAt, true)}`}
          </p>
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-slate-50 to-sky-50/60 p-5 ring-1 ring-inset ring-slate-100">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{notice.body}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export interface NoticeCardProps {
  notice: Notice;
  onOpen: (notice: Notice) => void;
  /** Extra controls (e.g. Publish) shown on the right; clicks don't open the modal. */
  actions?: ReactNode;
  /** Stagger index for the entrance animation. */
  index?: number;
}

// Unread published notices get an amber accent bar, a softly pulsing
// glow, and a blinking "New" badge, so they are impossible to miss;
// read ones settle back to a calm neutral card.
export function NoticeCard({ notice, onOpen, actions, index = 0 }: NoticeCardProps) {
  const unread = !!notice.publishedAt && !notice.isRead;
  const isDraft = !notice.publishedAt;
  const when = formatDate(notice.publishedAt ?? notice.createdAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(notice)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(notice);
        }
      }}
      style={{ animationDelay: `${index * 70}ms` }}
      aria-label={`Open notice: ${notice.title}`}
      className={[
        'group relative flex animate-fade-in-up cursor-pointer items-start gap-4 overflow-hidden rounded-2xl border bg-white p-4 pl-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated',
        unread ? 'animate-glow-pulse border-amber-300/80' : 'border-slate-200/80 hover:border-brand-blue/30',
      ].join(' ')}
    >
      <span
        className={['absolute inset-y-0 left-0 w-1.5', unread ? 'bg-gradient-to-b from-amber-400 to-orange-500' : isDraft ? 'bg-slate-300' : 'bg-slate-200 group-hover:bg-brand-blue/50'].join(' ')}
        aria-hidden="true"
      />
      <span
        className={[
          'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105',
          unread ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_24px_-8px_rgba(245,158,11,0.6)]' : 'bg-slate-100 text-slate-500',
        ].join(' ')}
      >
        {unread ? <Bell size={20} className="origin-top animate-wiggle" /> : <Megaphone size={20} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[15px] font-bold text-navy">{notice.title}</h3>
          {unread && (
            <Badge tone="warning" pulse>
              New
            </Badge>
          )}
          {isDraft && <Badge tone="neutral">Draft</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{notice.body}</p>
        <p className="mt-2 flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="flex items-center gap-1">
            <Users size={13} /> {AUDIENCE_LABELS[notice.audienceType]}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays size={13} /> {when}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center" onClick={(e) => e.stopPropagation()}>
        {actions}
        <ChevronRight
          size={18}
          className="text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-blue"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
