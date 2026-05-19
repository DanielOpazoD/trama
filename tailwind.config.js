/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        // Spectral has more character than Iowan/Palatino. Editorial feel.
        serif: ['Spectral', '"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
      },
      colors: {
        // Paper palette — warm cream with ink-like text
        paper: {
          50: '#FBF8F0',
          100: '#F5EFE0',
          200: '#ECE3CB',
          300: '#DBCFAF',
          400: '#BFAE87',
          500: '#9E8C66',
          600: '#7A6B4F',
          700: '#5A4E3A',
          800: '#3D3528',
          900: '#251F17',
        },
        ink: {
          50: '#F1EEE7',
          100: '#D9D3C5',
          200: '#B0A790',
          300: '#857C66',
          400: '#5C5443',
          500: '#3A3429',
          600: '#262219',
          700: '#1A1812',
          800: '#13110C',
          900: '#0D0B08',
        },
      },
    },
  },
  plugins: [],
}
