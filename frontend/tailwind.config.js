/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'selector',
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ]
      },
      colors: {
        body: 'rgb(15, 23, 42)',
        'body-bg': 'rgb(248, 250, 252)',
      }
    }
  }
}
