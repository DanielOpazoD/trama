/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Palatino', 'Georgia', 'Cambria', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
