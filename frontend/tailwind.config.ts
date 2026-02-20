import type { Config } from 'tailwindcss'

export default {
  // 使用 class 切换夜间模式
  darkMode: 'class',
  // TailwindCSS 作用范围
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ]
} satisfies Config
