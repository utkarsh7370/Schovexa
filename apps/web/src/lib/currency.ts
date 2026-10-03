// Amounts move as minor units (paise/cents) end-to-end on the wire
// (packages/validation's fee schemas) — formatting to a major-unit
// display value is purely a UI concern, done here in one place.
// Hardcoded to ₹ for now; a school's own `currency` setting isn't wired
// into display formatting yet (Intl.NumberFormat currency codes would
// need it), matching this phase's other simplifications.
export function formatMinor(amountMinor: number): string {
  // Indian digit grouping (₹1,23,456.00) — the same as receipts, emails and exports.
  const sign = amountMinor < 0 ? '-' : '';
  return `${sign}₹${(Math.abs(amountMinor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function majorToMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / 100;
}
