import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  // 配置文档源目录
  srcDir: "src",
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
    // 效果: 浏览器访问 /en/ 时，自动重定向到 /
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
          { text: 'Developer Guide', link: '/developer-guide/' }
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
          { text: '用户指南', link: '/用户指南/' },
          { text: '开发文档', link: '/开发文档/' }
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
