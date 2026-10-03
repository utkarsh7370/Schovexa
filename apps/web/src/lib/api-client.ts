// The one place that calls fetch against the API — docs/frontend-
// architecture.md §4. Never reads or sends a schoolId from client state:
// the API derives tenant context entirely from the session cookie
// (docs/multi-tenancy.md §2), so this client doesn't need to either.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    try {
      const body = await res.json();
      return new ApiError(body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Request failed', body?.error?.details);
    } catch {
      return new ApiError('ERROR', 'Request failed');
    }
  }
}

// Sensitive actions (inviting people, editing roles, disabling access…)
// ask for the password again when the last sign-in is stale. The app
// registers one handler — a dialog — and a request that was refused with
// REAUTH_REQUIRED is retried once after the person confirms.
type ReauthHandler = () => Promise<boolean>;
let reauthHandler: ReauthHandler | null = null;
export function setReauthHandler(handler: ReauthHandler | null) {
  reauthHandler = handler;
}

async function apiRequest<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  // FormData (file uploads) must NOT get a manual Content-Type — fetch
  // sets the multipart boundary itself only when the header is absent.
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
  });

  if (!res.ok) {
    const error = await ApiError.fromResponse(res);
    if (error.code === 'REAUTH_REQUIRED' && reauthHandler && !retried && !path.startsWith('/auth/')) {
      if (await reauthHandler()) return apiRequest<T>(path, init, true);
    }
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// A file (PDF, spreadsheet, photo) as a Blob, for download or preview. Goes through
// the same cookie session as every other call, so nothing is ever a public URL.
async function apiBlob(path: string, retried = false): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`${API_URL}${path}`, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    const error = await ApiError.fromResponse(res);
    if (error.code === 'REAUTH_REQUIRED' && reauthHandler && !retried) {
      if (await reauthHandler()) return apiBlob(path, true);
    }
    throw error;
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: match ? match[1] : null };
}

/** Fetches a file and hands it to the browser as a download. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const { blob, filename } = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Fetches a file and opens it in a new tab (a PDF to print, say). */
export async function openFile(path: string): Promise<void> {
  const { blob } = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  blob: apiBlob,
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'POST', body: formData }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
