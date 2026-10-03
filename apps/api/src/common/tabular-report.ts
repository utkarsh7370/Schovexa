import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { toCsv } from './csv.util';

// One tabular report shape — columns, rows, totals — used by every report in the app (finance,
// teaching…). The screen, CSV, Excel and PDF are all rendered from the same object, so they can
// never disagree with each other. Money is carried in minor units and shown as rupees on export.

export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';

export interface ReportColumn {
  key: string;
  header: string;
  type: ColumnType;
}

export type ReportRow = Record<string, string | number | null>;

export interface TabularReport {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Totals shown under the table (money in minor units). */
  totals: { label: string; value: number; type: 'money' | 'number' | 'percent' }[];
  /** Said plainly when a report has nothing to show for a reason. */
  note: string | null;
  generatedAt: string;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'pdf'];

export const col = (key: string, header: string, type: ColumnType = 'text'): ReportColumn => ({ key, header, type });
export const sumOf = (rows: ReportRow[], key: string): number => rows.reduce((n, r) => n + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function cell(value: string | number | null | undefined, type: ColumnType): string | number {
  if (value === null || value === undefined) return '';
  if (type === 'money' && typeof value === 'number') return Math.round(value) / 100;
  // A name that starts with = + - or @ would run as a formula when the file is opened in a spreadsheet.
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csv(report: TabularReport): Buffer {
  const text = toCsv(report.rows, report.columns.map((c) => ({ header: c.type === 'money' ? `${c.header} (INR)` : c.header, key: (row: ReportRow) => cell(row[c.key], c.type) })));
  return Buffer.from(text, 'utf-8');
}

async function xlsx(report: TabularReport, schoolName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = schoolName;
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([`${schoolName} — ${report.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC`]);
  ws.addRow([]);
  const head = ws.addRow(report.columns.map((c) => c.header));
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  });
  for (const row of report.rows) ws.addRow(report.columns.map((c) => cell(row[c.key], c.type)));
  report.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = Math.max(12, Math.min(40, c.header.length + 4));
    if (c.type === 'money') column.numFmt = '#,##0.00';
  });
  if (report.totals.length) {
    ws.addRow([]);
    for (const t of report.totals) {
      const r = ws.addRow([t.label, t.type === 'money' ? t.value / 100 : t.value]);
      r.font = { bold: true };
      if (t.type === 'money') r.getCell(2).numFmt = '#,##0.00';
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function pdf(report: TabularReport, schoolName: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const landscape = report.columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - 72;
    // The built-in PDF font has no ₹ sign, so amounts read "Rs.".
    const money = (n: number) => `Rs. ${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmt = (v: string | number | null | undefined, type: ColumnType) => (v === null || v === undefined ? '' : type === 'money' && typeof v === 'number' ? money(v) : type === 'percent' && typeof v === 'number' ? `${v}%` : String(v));

    doc.font('Helvetica-Bold').fontSize(14).text(schoolName);
    doc.fontSize(11).text(report.title);
    doc.font('Helvetica').fontSize(8).fillColor('#555').text(`Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC`).fillColor('#000').moveDown(0.6);

    // Money and number columns are narrower than text ones.
    const weights = report.columns.map((c) => (c.type === 'text' ? 1.6 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * width);
    const fontSize = report.columns.length > 9 ? 6.5 : 8;
    const drawRow = (cells: string[], bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const heights = cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 4 }));
      const rowHeight = Math.max(...heights, fontSize) + 4;
      if (doc.y + rowHeight > doc.page.height - 50) doc.addPage();
      const y = doc.y;
      let x = 36;
      cells.forEach((text, i) => {
        const numeric = ['money', 'number', 'percent'].includes(report.columns[i].type);
        doc.text(text, x + 2, y + 2, { width: widths[i] - 4, align: numeric ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + rowHeight;
      doc.moveTo(36, doc.y - 1).lineTo(36 + width, doc.y - 1).strokeColor('#ddd').lineWidth(0.5).stroke();
    };
    drawRow(report.columns.map((c) => c.header), true);
    if (report.rows.length === 0) doc.moveDown(0.5).font('Helvetica-Oblique').text(report.note ?? 'Nothing to show for these filters.');
    for (const row of report.rows) drawRow(report.columns.map((c) => fmt(row[c.key], c.type)), false);
    if (report.totals.length) {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(9);
      for (const t of report.totals) doc.text(`${t.label}: ${t.type === 'money' ? money(t.value) : t.type === 'percent' ? `${t.value}%` : t.value}`, 36);
    }
    if (report.note && report.rows.length > 0) doc.moveDown(0.4).font('Helvetica-Oblique').fontSize(8).text(report.note, 36);
    doc.end();
  });
}

/** The report as a downloadable file in the chosen format. */
export async function renderReport(report: TabularReport, format: ExportFormat, schoolName: string): Promise<{ buffer: Buffer; contentType: string }> {
  const buffer = format === 'csv' ? csv(report) : format === 'xlsx' ? await xlsx(report, schoolName) : await pdf(report, schoolName);
  return { buffer, contentType: CONTENT_TYPES[format] };
}
