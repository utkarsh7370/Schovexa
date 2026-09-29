import { CheckIcon } from './icons';

export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0–9)', test: (p) => /\d/.test(p) },
  { label: 'A symbol (e.g. ! @ # $ %)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

const LEVELS = [
  { label: 'Too weak', bar: 'bg-red-500', text: 'text-red-600' },
  { label: 'Weak', bar: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Good', bar: 'bg-lime-500', text: 'text-lime-600' },
  { label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-600' },
];

// Live feedback while typing a new password: a 5-segment meter plus the
// exact checklist the form validates against, so a failed submit is never
// a surprise about what was missing.
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const level = LEVELS[Math.max(0, passed - 1)];
  const effective = passed === 0 ? LEVELS[0] : level;

  return (
    <div className="animate-fade-in rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {PASSWORD_RULES.map((_, i) => (
          <div
            key={i}
            className={['h-1.5 flex-1 rounded-full transition-colors duration-300', i < passed ? effective.bar : 'bg-slate-200'].join(' ')}
          />
        ))}
      </div>
      <p className={['mt-2 text-xs font-semibold', effective.text].join(' ')} aria-live="polite">
        Password strength: {effective.label}
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} className={['flex items-center gap-1.5 text-xs transition-colors', ok ? 'text-emerald-600' : 'text-slate-500'].join(' ')}>
              <span
                className={[
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors',
                  ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-transparent',
                ].join(' ')}
              >
                <CheckIcon size={11} strokeWidth={3.5} />
              </span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
