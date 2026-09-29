// Shared query-string pagination parsing — one convention (page/pageSize,
// 1-indexed) for every paginated list/report endpoint, so the frontend
// only has to learn it once.

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta extends PaginationParams {
  total: number;
  totalPages: number;
}

export function parsePagination(pageRaw: string | undefined, pageSizeRaw: string | undefined): PaginationParams {
  const parsedPage = Number.parseInt(pageRaw ?? '', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedPageSize = Number.parseInt(pageSizeRaw ?? '', 10);
  const pageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
