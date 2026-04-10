/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        cream: {
          50: '#FDFCF9',
          100: '#F8F5F0',
          200: '#F0EDE7',
          300: '#E5E1D9',
          400: '#D5D0C7',
        },
        stone: {
          950: '#1C1917',
          900: '#292524',
          800: '#44403C',
          600: '#78716C',
          400: '#A8A29E',
          300: '#D6D3D1',
        },
        ink: '#1C1917',
      },
    },
  },
  plugins: [],
}
