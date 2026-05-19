/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['Spectral', '"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
      },
      // Palette wired to CSS variables. When .dark is applied to <html>,
      // the variables change values and every Tailwind class auto-updates.
      // No need to sprinkle dark:text-stone-XXX everywhere.
      colors: {
        paper: {
          50:  'var(--paper-50)',
          100: 'var(--paper-100)',
          200: 'var(--paper-200)',
          300: 'var(--paper-300)',
        },
        ink: {
          50:  'var(--ink-50)',
          100: 'var(--ink-100)',
          200: 'var(--ink-200)',
          300: 'var(--ink-300)',
          400: 'var(--ink-400)',
          500: 'var(--ink-500)',
          600: 'var(--ink-600)',
          700: 'var(--ink-700)',
          800: 'var(--ink-800)',
        },
      },
    },
  },
  plugins: [],
}
