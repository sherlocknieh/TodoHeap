import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/TodoHeap/', // 这里必须匹配你的 GitHub 仓库名
})
