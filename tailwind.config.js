/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  // ADDED: Enable dark mode using the 'class' strategy
  darkMode: 'class', 
  theme: {
    extend: {
      colors: {
        indigo: { 900: '#2B2F8A' },
        teal: { 500: '#00E0A1', 400: '#00C390' },
        orange: { 500: '#FFB86B' }
      }
    }
  },
  plugins: [],
}