/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#1a0f12',
          secondary: '#1f0e14',
          tertiary: '#26121a',
        },
        border: {
          primary: '#3a1a22',
          secondary: '#451828',
        },
        text: {
          primary: '#fde8d8',
          secondary: '#8a5060',
          muted: '#4e2830',
        },
        crimson: {
          DEFAULT: '#c0152a',
          dark: '#7a0812',
          dim: '#2a0810',
          dim2: '#1a0208',
        },
      },
    },
  },
  plugins: [],
}