/** @type {import('tailwindcss').Config} */
// STEEL NEON: тёмный navy, электрический синий, неоновый cyan, стальной серебристый.
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#030812', 900: '#050D1D', 850: '#071B36', 800: '#0B2547', 700: '#0F2F57', 600: '#244D78' },
        line: '#244D78',
        ice: '#F5FAFF',
        muted: '#8CA9C5',
        steel: { DEFAULT: '#C6D7EB', soft: '#E7F4FF', deep: '#54789E' },
        electric: { DEFAULT: '#176BFF', soft: '#5C9BFF', deep: '#0F4FCC' },
        neon: { DEFAULT: '#00DFFF', soft: '#7AEFFF', deep: '#00A9C9' },
        danger: { DEFAULT: '#FF5470', soft: '#FF8FA1', deep: '#D93A55' },
      },
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 10px rgba(0,223,255,.35), 0 0 28px rgba(23,107,255,.24)',
        'neon-lg': '0 0 18px rgba(0,223,255,.45), 0 0 60px rgba(23,107,255,.35)',
        cta: '0 10px 30px -8px rgba(23,107,255,.65), 0 0 0 1px rgba(122,239,255,.25) inset',
      },
    },
  },
  plugins: [],
};
