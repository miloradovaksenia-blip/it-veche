/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080C', 900: '#0B0D12', 850: '#10131A', 800: '#151922', 700: '#1E2330', 600: '#2A3142' },
        coral: { DEFAULT: '#FF6F5E', soft: '#FF9A8C', deep: '#E2483A' },
        electric: { DEFAULT: '#3D8BFF', soft: '#7DB1FF', deep: '#1F66E0' },
        emerald: { DEFAULT: '#2ED8A3', soft: '#7CEBC7', deep: '#14B583' },
      },
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
