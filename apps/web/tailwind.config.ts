import type { Config } from 'tailwindcss';

// Schovexa brand tokens (docs: brand guidelines shared in this project's
// conversation, not yet a written doc). packages/ui ships as TS source
// (no separate CSS build), so Tailwind's content scanner needs to reach
// into it directly for the design-system components' class names to
// actually get generated.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#001040',
        brand: {
          blue: '#0080F0',
          electric: '#00B0F0',
          violet: '#7020F0',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00B0F0 0%, #0080F0 50%, #7020F0 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(0,176,240,0.08) 0%, rgba(112,32,240,0.08) 100%)',
      },
      boxShadow: {
        // One consistent elevation scale, used instead of ad hoc shadow
        // values per component — "card" for resting surfaces, "elevated"
        // for anything that should read as raised above the page (open
        // menus, dialogs, the sidebar's active item).
        card: '0 1px 2px 0 rgba(0, 16, 64, 0.04), 0 1px 3px 0 rgba(0, 16, 64, 0.06)',
        elevated: '0 8px 24px -4px rgba(0, 16, 64, 0.12), 0 2px 8px -2px rgba(0, 16, 64, 0.08)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
