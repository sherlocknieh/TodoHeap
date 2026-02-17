import { defineConfig, type HeadConfig } from 'vitepress'
import { withSidebar } from 'vitepress-sidebar';

const vitePressOptions = {
  // https://vitepress.dev/reference/site-config
  base: process.env.NODE_ENV === 'production' ? '/TodoHeap/docs/' : '/', // 构建静态网页时添加基础路径
  // 本文档部署在 https://sherlocknieh.github.io/TodoHeap/docs/ 路径下,
  // 静态网页中资源(CSS/JS/图片文件等)的引用路径默认相对于服务器域名的根目录,
  // 访问 /assets/style.css 相当于访问 https://sherlocknieh.github.io/assets/style.css
  // 需要把 /assets/style.css 改为 /TodoHeap/docs/assets/style.css 才能正确访问
  // Vite 构建时会根据 base 配置给资源链接添加前缀, 并处理多余的双斜杠, 解决资源路径问题
  head: [
    // 设置浏览器标签栏图标
    ['link', { rel: 'icon', href: '/logo.png' }]
  ] as HeadConfig[],

  outDir: '../dist/docs', // 与前端混合部署的输出目录
  vite: {
    server: {
      open: true,  // 调试时自动打开浏览器
    },
  },
    ignoreDeadLinks: true,  // 即使有死链也不中断构建
    // 通用主题配置
    themeConfig: {
      logo: '/logo.png',
      socialLinks: [
        { icon: 'github', link: 'https://github.com/sherlocknieh/TodoHeap' }
      ],
    },
    // URL重写规则
    rewrites: {
      'en/:rest*': ':rest*',  // 构建时会把 en/ 目录下的文件移动到根目录
      // 效果1: 浏览器访问 / 时，实际展示 en/index.md 内容
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
          footer: {
            message: 'Documentation built with <a href="https://vitepress.dev/">VuePress</a>',
            copyright: 'Copyright © 2026 TodoHeap'
          },
        }
      },
      'zh': {
        label: '简体中文',
        lang: 'zh',
        link: '/zh/',

        title: "TodoHeap 任务堆",
        description: "TodoHeap 文档",

        themeConfig: {
          // https://vitepress.dev/reference/default-theme-config
          nav: [
            { text: '用户指南', link: '/zh/user-guide/' },
            { text: '开发文档', link: '/zh/dev-guide/' }
          ],

          footer: {
            message: '文档使用 <a href="https://vitepress.dev/zh/">VuePress</a> 构建',
            copyright: 'Copyright © 2026 TodoHeap'
          },
        },
      }
    },
  };

  // 生成多语言×多文件夹侧边栏
  const languages = ['zh', 'en'];
  const folders = ['user-guide', 'dev-guide'];
  const sidebarConfigs = languages.flatMap(lang =>
    folders.map(mod => ({
      scanStartPath: `${lang}/${mod}`,  // 当前侧栏扫描的目录
      resolvePath: `/${lang}/${mod}/`,  // 当前侧边栏链接前缀
      useTitleFromFileHeading: true,    // 从文档内部获取标题
      collapsed: false,                 // 子菜单默认不折叠
      capitalizeFirst: true,            // 菜单标题首字母大写
      includeRootIndexFile: true,       // 包含根目录的 index.md 文件
      includeFolderIndexFile: true,     // 包含文件夹目录的 index.md 文件
      useFolderTitleFromIndexFile: true,// 文件夹标题从 index.md 文档内获取
      useFolderLinkFromIndexFile: true, // 点击文件夹标题跳转 index.md
      manualSortFileNameByPriority: [   // 排序优先级
        'index.md',
        'user-guide',
        'dev-guide',
      ]
    }))
  );

  export default defineConfig(withSidebar(vitePressOptions, sidebarConfigs));
