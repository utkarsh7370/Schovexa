import { useEffect, useState } from 'react';

// Paging for lists the API returns in full (a school's fee structures,
// teachers, parents…): slices the already-filtered `items` and snaps back
// to page 1 whenever `resetKey` (the active filters) changes.
export function useClientPaging<T>(items: T[], resetKey: string, sizes: number[] = [10, 25, 50]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(sizes[0]);

  useEffect(() => setPage(1), [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { page: safePage, setPage, pageSize, setPageSize, totalPages, visible, sizes };
}
