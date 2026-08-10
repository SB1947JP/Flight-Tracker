/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // No webfont is bundled: this app is meant to be small and to work with
      // no network at all, and a variable font is a bigger download than the
      // entire world coastline it draws. The system UI face is what the OS has
      // already loaded.
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
