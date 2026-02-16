import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  // 配置文档源目录
  srcDir: "src",
  base: process.env.NODE_ENV === 'production' ? '/TodoHeap/docs/' : '/', // 构建静态网页时添加基础路径
  // 静态网页中资源(CSS/JS/图片文件等)的引用路径默认相对于服务器域名的根目录,
  // 本文档部署在 https://sherlocknieh.github.io/TodoHeap/docs/ 路径下,
  // 访问 /assets/style.css 相当于访问 https://sherlocknieh.github.io/assets/style.css
  // 需要把 /assets/style.css 改为 /TodoHeap/docs/assets/style.css 才能正确访问
  // Vite 构建时会根据 base 配置给资源链接添加前缀, 并处理多余的双斜杠, 解决资源路径问题
  
  outDir: '../dist/docs', // 与前端混合部署的输出目录
  // 调试时自动打开浏览器
  vite: {
    server: {
      open: true
    }
  },
  // 默认情况下存在死链会导致构建失败, 忽略死链可以避免构建失败
  ignoreDeadLinks: true,
  // 通用主题配置
  themeConfig: {
    socialLinks: [
          { icon: 'github', link: 'https://github.com/sherlocknieh/TodoHeap' }
        ],
  },
  // URL重写规则
  rewrites: {
    'en/:rest*': ':rest*',  // 构建时会把 en/ 目录下的文件移动到根目录
    // 效果: 浏览器访问 / 时，实际展示 en/index.md 内容
    // 效果2: 浏览器访问 /en/ 时，自动重定向到 /
  },
  // 多语言配置
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      link: '/',
      title: "TodoHeap",
      description: "TodoHeap Documentation",
      themeConfig: {
        nav: [
          { text: 'User Guide', link: '/user-guide/' },
          { text: 'Developer Guide', link: '/dev-guide/' }
        ],
        sidebar: []
      }
    },
    'zh-CN': {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh-CN/',

      title: "TodoHeap 任务堆",
      description: "TodoHeap 文档",

      themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { text: '用户指南', link: '/zh-CN/user-guide/' },
          { text: '开发文档', link: '/zh-CN/dev-guide/' }
        ],

        sidebar: [],

        footer: {
          message: 'Documentation built with <a href="https://vitepress.dev/">VuePress</a>',
          copyright: 'Copyright © 2026 TodoHeap'
        },

      },
    }
  },
})
