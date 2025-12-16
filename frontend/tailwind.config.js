/** @type {import('tailwindcss').Config} */
export default {
  // 使用 class 切换暗黑模式
  darkMode: 'class',
  // 指定需要扫描的文件路径
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ]
}
