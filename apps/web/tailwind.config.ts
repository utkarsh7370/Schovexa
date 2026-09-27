import type { Config } from 'tailwindcss';

// Schovexa brand tokens (docs: brand guidelines shared in this project's
// conversation, not yet a written doc) — kept minimal at Foundation stage;
// extended as the design-system package (packages/ui) is built.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
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
    },
  },
  plugins: [],
};

export default config;
