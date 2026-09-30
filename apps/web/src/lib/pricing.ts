import type { MarketCode } from './market';

// Price lists per market. School-size based, not per-user: one
// subscription per school, priced on active student count, with
// unlimited staff / admin / parent accounts inside every plan.
// Amounts are whole major units (rupees / dollars), tax excluded.
// These are Schovexa's own list prices — edit here and the homepage
// follows; nothing else reads them yet (there is no billing backend).

export type PlanId = 'starter' | 'growth' | 'professional' | 'business' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Student cap, shown as "Up to N students"; null = custom. */
  students: number | null;
  studentsLabel: string;
  monthly: number | null;
  annual: number | null;
  popular?: boolean;
  cta: { label: string; kind: 'trial' | 'sales' };
}

export interface Market {
  code: MarketCode;
  name: string;
  currency: string;
  locale: string;
  taxNote: string;
  plans: Plan[];
  addOns: { name: string; price: string }[];
  /** One-off costs kept separate from the subscription. */
  implementation?: string;
}

const IN_PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', tagline: 'For small schools', students: 200, studentsLabel: 'Up to 200 students', monthly: 1499, annual: 14999, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'growth', name: 'Growth', tagline: 'For growing schools', students: 500, studentsLabel: 'Up to 500 students', monthly: 2499, annual: 24999, popular: true, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'professional', name: 'Professional', tagline: 'For established schools', students: 1000, studentsLabel: 'Up to 1,000 students', monthly: 3999, annual: 39999, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'business', name: 'Business', tagline: 'For larger schools', students: 2000, studentsLabel: 'Up to 2,000 students', monthly: 6499, annual: 64999, cta: { label: 'Contact sales', kind: 'sales' } },
  { id: 'enterprise', name: 'Enterprise', tagline: 'School groups & multiple branches', students: null, studentsLabel: '2,000+ students', monthly: null, annual: null, cta: { label: 'Talk to us', kind: 'sales' } },
];

const US_PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', tagline: 'For small schools', students: 250, studentsLabel: 'Up to 250 students', monthly: 99, annual: 999, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'growth', name: 'Growth', tagline: 'For growing schools', students: 500, studentsLabel: 'Up to 500 students', monthly: 179, annual: 1799, popular: true, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'professional', name: 'Professional', tagline: 'For established schools', students: 1000, studentsLabel: 'Up to 1,000 students', monthly: 299, annual: 2999, cta: { label: 'Start free trial', kind: 'trial' } },
  { id: 'business', name: 'Business', tagline: 'For larger schools', students: 2500, studentsLabel: 'Up to 2,500 students', monthly: 499, annual: 4999, cta: { label: 'Contact sales', kind: 'sales' } },
  { id: 'enterprise', name: 'Enterprise', tagline: 'School groups & districts', students: null, studentsLabel: '2,500+ students', monthly: null, annual: null, cta: { label: 'Talk to us', kind: 'sales' } },
];

export const MARKETS: Record<MarketCode, Market> = {
  IN: {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    locale: 'en-IN',
    taxNote: '+ GST as applicable',
    plans: IN_PLANS,
    addOns: [
      { name: 'WhatsApp messaging', price: 'Usage-based' },
      { name: 'SMS', price: 'Usage-based' },
      { name: 'Online payment gateway', price: 'Gateway fee, passed through' },
      { name: 'Custom domain', price: '₹1,000–₹2,000 / year' },
      { name: 'Data migration', price: '₹3,000–₹10,000' },
      { name: 'On-site training', price: '₹2,000–₹5,000 / session' },
      { name: 'Dedicated support', price: '₹1,000–₹5,000 / month' },
      { name: 'Custom branding / white-label', price: 'From ₹10,000' },
    ],
  },
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    locale: 'en-US',
    taxNote: 'Sales tax where applicable',
    plans: US_PLANS,
    implementation:
      'Implementation is quoted separately from the subscription: typically $500–$1,500 for schools up to 500 students, and $1,500–$5,000+ for larger deployments (data migration, configuration, training, integrations, custom branding).',
    addOns: [
      { name: 'Implementation & onboarding', price: '$500–$5,000+, by scope' },
      { name: 'SMS & messaging', price: 'Usage-based' },
      { name: 'Online payments', price: 'Processor fee, passed through' },
      { name: 'Custom feature development', price: 'Quotation' },
    ],
  },
};

export function formatPrice(market: Market, amount: number): string {
  return new Intl.NumberFormat(market.locale, { style: 'currency', currency: market.currency, maximumFractionDigits: 0 }).format(amount);
}

/** What paying annually saves versus twelve monthly payments, or null for custom plans. */
export function annualSaving(plan: Plan): { amount: number; percent: number } | null {
  if (plan.monthly === null || plan.annual === null) return null;
  const amount = plan.monthly * 12 - plan.annual;
  return amount > 0 ? { amount, percent: Math.round((amount / (plan.monthly * 12)) * 100) } : null;
}

// Everything below ships in every plan — student count is the only
// thing that changes between them, which is what keeps the pitch simple.
export const INCLUDED_FEATURES = [
  'Student management',
  'Parent management',
  'Teacher & staff management',
  'Admissions',
  'Classes & sections',
  'Subjects',
  'Attendance',
  'Fee management',
  'Fee receipts',
  'Notices & announcements',
  'Parent portal',
  'Role-based permissions',
  'Reports & CSV export',
  'Student documents',
  'Notifications',
  'Dashboard',
  'Audit logs',
  'Automatic backups',
  'Security updates',
  'Product updates',
];
