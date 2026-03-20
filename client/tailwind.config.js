/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:  '#e94560',
        bg:       '#1a1a2e',
        card:     '#16213e',
        surface:  '#0f3460',
        text:     '#eaeaea',
        muted:    '#8892a4',
        success:  '#22c55e',
        warning:  '#f59e0b',
        danger:   '#ef4444'
      },
      fontFamily: {
        heebo: ['Heebo', 'sans-serif']
      }
    }
  },
  plugins: []
};
