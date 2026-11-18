import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue()], // Vite 支持管理不同的技术栈, 需要在此注册以明确使用了哪种组合
  base: '/TodoHeap/app/',          // 应用挂在文档站点的 /app/ 子路径
  // 站点根路径由文档站（VitePress）占用，前端只负责 /app/ 下的工作区。
  // Vite 会按 base 给资源链接加前缀，并处理多余的双斜杠。
  build: {
    outDir: '../dist/app', // 与文档产物 dist/ 分区，文档构建会清空 dist，所以文档必须先构建
    emptyOutDir: true,     // outDir 在项目根外，需显式开启，避免残留旧文件
  },
  server: {
    open: true, // 调试时自动打开浏览器
    port: 5200, // 前端开发服务器端口
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') } // 设置 @ 为 src 目录的别名
    // 能用的地方: 在模块导入语句中，如 import Component from '@/components/Component.vue'
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
})