import { Globe2 } from 'lucide-react';

// Inline SVG flags, not emoji: Windows renders flag emoji as the bare
// letters "IN" / "US", so an emoji flag would look broken for a large
// share of visitors. Only the markets we sell in get a drawn flag; any
// other country falls back to a globe.
export function CountryFlag({ code, size = 20 }: { code: string | null; size?: number }) {
  const height = Math.round((size * 2) / 3);
  const common = { width: size, height, viewBox: '0 0 30 20', role: 'img' as const, className: 'shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,16,64,0.12)]' };

  if (code === 'IN') {
    return (
      <svg {...common} aria-label="India">
        <rect width="30" height="20" fill="#fff" />
        <rect width="30" height="6.67" fill="#FF9933" />
        <rect y="13.33" width="30" height="6.67" fill="#138808" />
        <circle cx="15" cy="10" r="2.7" fill="none" stroke="#000080" strokeWidth="0.7" />
        <circle cx="15" cy="10" r="0.6" fill="#000080" />
      </svg>
    );
  }

  if (code === 'US') {
    return (
      <svg {...common} aria-label="United States">
        <rect width="30" height="20" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => (
          <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
        ))}
        <rect width="12.5" height="10.77" fill="#3C3B6E" />
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3, 4].map((col) => <circle key={`${row}-${col}`} cx={1.8 + col * 2.2 + (row % 2) * 1.1} cy={1.6 + row * 2.5} r="0.55" fill="#fff" />),
        )}
      </svg>
    );
  }

  return <Globe2 size={size} className="shrink-0 text-slate-400" aria-label={code ?? 'Unknown location'} />;
}
