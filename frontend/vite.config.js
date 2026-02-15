import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue()],
  base: process.env.NODE_ENV === 'production' ? '/TodoHeap/' : '/', // 生产环境下, 需设置基础路径
  outDir: '../dist',
  server: {
    open: true, // 调试时自动打开浏览器
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src') // 设置 @ 指向 src 目录
    }
  }
})
