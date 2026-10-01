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
        'brand-gradient-dark': 'linear-gradient(160deg, #001040 0%, #061a5c 55%, #1b0f66 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(0,176,240,0.08) 0%, rgba(112,32,240,0.08) 100%)',
      },
      boxShadow: {
        // One consistent elevation scale, used instead of ad hoc shadow
        // values per component — "card" for resting surfaces, "elevated"
        // for anything that should read as raised above the page (open
        // menus, dialogs, the sidebar's active item).
        card: '0 1px 2px 0 rgba(0, 16, 64, 0.04), 0 1px 3px 0 rgba(0, 16, 64, 0.06)',
        elevated: '0 8px 24px -4px rgba(0, 16, 64, 0.12), 0 2px 8px -2px rgba(0, 16, 64, 0.08)',
        glow: '0 10px 30px -8px rgba(0, 128, 240, 0.55)',
        'glow-violet': '0 10px 30px -8px rgba(112, 32, 240, 0.5)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      // Motion tokens — every animation in the app comes from this one
      // list, so timing feels consistent and prefers-reduced-motion (see
      // globals.css) can switch all of it off in one place.
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'scale-out': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -40px) scale(1.08)' },
          '66%': { transform: 'translate(-24px, 24px) scale(0.94)' },
        },
        'ping-soft': {
          '0%': { transform: 'scale(1)', opacity: '0.75' },
          '80%, 100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(245, 158, 11, 0.45)' },
          '50%': { boxShadow: '0 0 0 10px rgba(245, 158, 11, 0)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'draw-check': { '0%': { strokeDashoffset: '48' }, '100%': { strokeDashoffset: '0' } },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '70%': { opacity: '1', transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
        shrink: { '0%': { width: '100%' }, '100%': { width: '0%' } },
        wiggle: {
          '0%, 50%, 100%': { transform: 'rotate(0deg)' },
          '10%': { transform: 'rotate(-14deg)' },
          '20%': { transform: 'rotate(12deg)' },
          '30%': { transform: 'rotate(-8deg)' },
          '40%': { transform: 'rotate(6deg)' },
        },
      },
      // Entrance animations use fill-mode `backwards` (not `both`) on
      // purpose: `both` would leave `transform: translateY(0)` applied
      // after the animation ends, and any transformed ancestor becomes
      // the containing block for `position: fixed` descendants — which
      // pushed every Dialog/ConfirmDialog rendered inside an animated
      // page wrapper off-center and under the sticky header.
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'scale-out': 'scale-out 0.2s ease-in both',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        float: 'float 7s ease-in-out infinite',
        'float-delayed': 'float 7s ease-in-out 2.5s infinite',
        blob: 'blob 14s ease-in-out infinite',
        'ping-soft': 'ping-soft 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
        'glow-pulse': 'glow-pulse 2.2s ease-in-out infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        wiggle: 'wiggle 2.8s ease-in-out infinite',
        'draw-check': 'draw-check 0.6s ease-out 0.25s backwards',
        pop: 'pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards',
      },
    },
  },
  plugins: [],
};

export default config;
