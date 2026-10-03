import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export type NoticeAudience = 'ALL_SCHOOL' | 'CLASS' | 'SECTION' | 'INDIVIDUAL';

export interface Notice {
  id: string;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  audienceRefId: string | null;
  publishedAt: string | null;
  /** Set while the notice is waiting to go out at a chosen time. */
  scheduledFor?: string | null;
  createdAt: string;
  isRead: boolean;
}

export interface Notification {
  id: string;
  noticeId: string | null;
  title: string;
  body: string;
  /** App path this notification opens (system notifications); null for notice-based ones. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const NOTICES_QUERY_KEY = ['notices'];
export const NOTIFICATIONS_QUERY_KEY = ['notifications'];

export function useNotices() {
  return useQuery({ queryKey: NOTICES_QUERY_KEY, queryFn: () => api.get<Notice[]>('/notices') });
}

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => api.get<Notification[]>('/notifications'),
    // The bell stays reasonably fresh without anyone reloading the page.
    refetchInterval: 60_000,
  });
}
