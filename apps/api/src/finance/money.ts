/** 123456 (paise) → "₹1,234.56". Amounts move as minor units end to end; this is for text only. */
export function formatMoney(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const rupees = Math.floor(abs / 100).toLocaleString('en-IN');
  return `${sign}₹${rupees}.${String(abs % 100).padStart(2, '0')}`;
}
