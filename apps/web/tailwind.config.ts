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
    },
  },
  plugins: [],
};

export default config;
