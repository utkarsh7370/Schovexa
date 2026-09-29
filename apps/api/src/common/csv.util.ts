import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

export interface CsvColumn<T> {
  key: keyof T | ((row: T) => unknown);
  header: string;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvValue(typeof c.key === 'function' ? c.key(row) : row[c.key])).join(','),
  );
  // CRLF line endings + trailing newline: the RFC 4180 convention most
  // spreadsheet tools (Excel especially) expect from a downloaded .csv.
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function sendCsv(res: Response, csv: string, filename: string): StreamableFile {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return new StreamableFile(Buffer.from(csv, 'utf-8'));
}
