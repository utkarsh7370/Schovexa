export interface AvatarProps {
  name: string;
  size?: number;
  /** `auto` (default) picks a stable color per name so people are recognizable at a glance; `brand` is always the brand gradient. */
  tone?: 'auto' | 'brand';
  /** White ring — for avatars that overlap a colored banner. */
  ring?: boolean;
  className?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Same name → same color, every time, on every screen.
const PALETTE = [
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-indigo-400 to-violet-600',
  'from-lime-400 to-emerald-600',
];

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// Initials-only avatar (no photo upload in the product yet) — used in
// the header's user menu, list cards and profile banners anywhere a
// person needs a visual anchor without a real headshot.
export function Avatar({ name, size = 36, tone = 'brand', ring = false, className }: AvatarProps) {
  return (
    <div
      className={[
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        tone === 'auto' ? `bg-gradient-to-br ${paletteFor(name)}` : 'bg-brand-gradient',
        ring ? 'ring-4 ring-white' : '',
        className ?? '',
      ].join(' ')}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );
}
