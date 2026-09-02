/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // No webfont. Half this interface is Japanese, and a face carrying kana
      // and kanji is a megabyte before it draws a single character. The OS has
      // already loaded one that does both scripts well.
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', 'Meiryo', 'Roboto', 'Arial', 'sans-serif'],
        // Money lines up in columns or it cannot be scanned.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
