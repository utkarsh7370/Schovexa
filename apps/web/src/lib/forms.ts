import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api-client';

// Maps an API error onto the form: field-level details (when the API
// sends them) land on the matching input, and a CONFLICT lands on
// `conflictField`, so users see the message next to the field they must
// change instead of a generic banner. Returns a banner message only for
// errors that don't belong to any one field.
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  options: { conflictField?: Path<T>; conflictMessage?: string; fallback?: string } = {},
): string | null {
  const fallback = options.fallback ?? 'Something went wrong. Please try again.';
  if (!(err instanceof ApiError)) return fallback;

  if (err.details?.length) {
    let placed = false;
    for (const detail of err.details) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.message });
      placed = true;
    }
    if (placed) return null;
  }
  if (err.code === 'CONFLICT' && options.conflictField) {
    setError(options.conflictField, {
      type: 'server',
      message: options.conflictMessage ?? err.message,
    });
    return null;
  }
  if (err.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a minute and try again.';
  return err.message || fallback;
}
