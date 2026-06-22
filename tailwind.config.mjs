/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm light scale: high numbers = light surfaces, low numbers = dark text
        ink: {
          950: '#FBF7EF', // page background (warm cream)
          900: '#F4EEE1', // panels / sidebar
          850: '#FFFFFF', // cards / inputs
          800: '#ECE4D4', // tracks / subtle fills
          700: '#DBD2BF', // borders
          600: '#B3A892', // faint text / icons
          500: '#8C8273', // muted text
          400: '#6C6454', // secondary text
          300: '#4A4438', // strong secondary
          200: '#2E2A22', // near-primary
          100: '#1C1812', // primary text / headings
        },
        brand: {
          DEFAULT: '#F2510E', // Mistral-style orange
          400: '#FF7A38',
          600: '#D8430A',
        },
        safe: '#0E9F6E',
        warn: '#D98005',
        danger: '#E0484D',
        accent: '#3B6FE0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(242,81,14,0.25), 0 10px 30px -12px rgba(242,81,14,0.30)',
        card: '0 1px 2px rgba(80,60,30,0.05), 0 14px 30px -18px rgba(120,90,50,0.25)',
      },
      keyframes: {
        flip: { '0%': { transform: 'scale(0.96)', opacity: '0.4' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        slidein: { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        flip: 'flip 220ms ease-out',
        slidein: 'slidein 260ms ease-out',
      },
    },
  },
  plugins: [],
}
