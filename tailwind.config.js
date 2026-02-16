/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      aspectRatio: {
        '9/16': '9 / 16',
      },
      colors: {
        brand: {
          primary: '#8b5cf6', // Example purple, adjust after seeing Figma
          secondary: '#d946ef',
          background: '#0f172a',
        }
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
