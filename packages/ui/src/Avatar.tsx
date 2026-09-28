export interface AvatarProps {
  name: string;
  size?: number;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Initials-only avatar (no photo upload in the product yet) — used in
// the header's user menu and anywhere a person needs a visual anchor
// without a real headshot.
export function Avatar({ name, size = 36 }: AvatarProps) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-gradient font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );
}
