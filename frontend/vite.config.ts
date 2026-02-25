import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue()], // Vite 支持管理不同的技术栈, 需要在此注册以明确使用了哪种组合
  base: '/TodoHeap/',              // 添加基础路径
  // 本项目部署在 https://sherlocknieh.github.io/TodoHeap/ 路径下,
  // 静态网页中资源(CSS/JS/图片文件等)的引用路径默认相对于服务器域名的根目录,
  // 访问 /assets/style.css 相当于访问 https://sherlocknieh.github.io/assets/style.css
  // 需要把 /assets/style.css 改为 /TodoHeap/docs/assets/style.css 才能正确访问
  // Vite 构建时会根据 base 配置给资源链接添加前缀, 并处理多余的双斜杠, 解决资源路径问题
  build: {
    outDir: '../dist',    // 指定构建输出目录, 用于与文档混合部署
  },
  server: { 
    open: true, // 调试时自动打开浏览器
    port: 5200, // 前端开发服务器端口
    proxy: {
      // 代理 /docs 路径下的请求到文档开发服务器
      '/TodoHeap/docs': {
        target: 'http://localhost:5201',  // 文档开发服务器地址
        changeOrigin: true,               // 修改请求头中的 Origin 字段
        },
    }
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') } // 设置 @ 为 src 目录的别名
    // 能用的地方: 在模块导入语句中，如 import Component from '@/components/Component.vue'
  },
})