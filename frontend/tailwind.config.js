/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Modern E-Commerce Theme
        primary: {
          DEFAULT: '#3b82f6', // blue-500
          hover: '#2563eb',   // blue-600
          light: '#eff6ff',   // blue-50
        },
        surface: '#ffffff',
        background: '#f8fafc', // slate-50
        border: {
          light: '#e2e8f0',   // slate-200
          DEFAULT: '#cbd5e1', // slate-300
        },
        text: {
          main: '#0f172a',    // slate-900
          muted: '#64748b',   // slate-500
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
