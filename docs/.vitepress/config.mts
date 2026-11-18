import { defineConfig, type HeadConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import katex from 'markdown-it-katex'

// 侧栏显式声明：URL 即文件路径，新增页面时在这里补一行。
// 不再依赖目录扫描插件，避免"改了目录、侧栏悄悄变化"。
const userSidebar = [
  { text: '用户指南', link: '/user/' },
  { text: '任务管理详解', link: '/user/01.task-management' },
  { text: 'AI 智能功能', link: '/user/02.ai-features' },
  { text: '视图详解', link: '/user/03.views' },
  { text: '数据同步与离线使用', link: '/user/04.sync-offline' },
  { text: '常见问题 (FAQ)', link: '/user/05.faq' },
  { text: '日历导入导出与订阅', link: '/user/06.calendar' },
]

const devSidebar = [
  { text: '开发指南', link: '/dev/' },
  { text: '项目愿景与方案', link: '/dev/00.goals' },
  { text: '环境搭建指南', link: '/dev/01.setup' },
  { text: '架构与技术栈', link: '/dev/02.architecture' },
  { text: '开发流程与常见任务', link: '/dev/03.development' },
  { text: '代码地图', link: '/dev/04.code-map' },
  { text: '关键词索引', link: '/dev/keyword-index' },
  {
    text: '逻辑文档',
    collapsed: false,
    items: [
      { text: '索引', link: '/dev/logic/' },
      { text: '任务创建逻辑', link: '/dev/logic/task-create' },
      { text: '任务图布局逻辑', link: '/dev/logic/mindmap-layout' },
      { text: '节点文字折行与节点高度', link: '/dev/logic/mindmap-text-wrap' },
      { text: '侧栏开合与窗口宽度', link: '/dev/logic/layout-sidebar' },
      { text: '详情右栏与任务图布局', link: '/dev/logic/layout-detail-panel' },
    ],
  },
]

const featuresSidebar = [
  { text: '功能现状', link: '/features/' },
  { text: '任务与层级', link: '/features/01.tasks' },
  { text: '视图与交互', link: '/features/02.views' },
  { text: 'AI 能力', link: '/features/03.ai' },
  { text: '日历与订阅', link: '/features/04.calendar' },
  { text: '同步与设置', link: '/features/05.sync-settings' },
]

// 站点占据 /TodoHeap/ 根路径：/ 是落地页，其余是文档，应用在 /app/ 子路径。
// 单语言：中文在 docs/ 根，URL 不带语言前缀；en/ 保留在磁盘但排除构建。
// 构建顺序：文档输出到 dist/（会清空），前端再输出到 dist/app/。
export default defineConfig(withMermaid({
  base: '/TodoHeap/',
  lang: 'zh-CN',
  title: 'TodoHeap 任务堆',
  description: 'TodoHeap 文档：AI 驱动的任务与日程管理',
  srcExclude: ['en/**', 'README.md'],

  head: [
    ['link', { rel: 'icon', href: '/TodoHeap/logo.svg' }],
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css' }],
    ['link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.0/contrib/copy-tex.min.css' }],
    ['script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.0/contrib/copy-tex.min.js' }]
  ] as HeadConfig[],

  markdown: {
    config: (md: any) => {
      md.use(katex)
    }
  },

  cleanUrls: true,
  outDir: '../dist',
  // 死链会让构建失败，避免把断链带上线
  ignoreDeadLinks: [/^\/app\//],

  vite: {
    server: {
      port: 5201,
    },
    optimizeDeps: {
      include: ['mermaid', 'dayjs', 'debug', '@braintree/sanitize-url', 'cytoscape', 'cytoscape-cose-bilkent', 'markdown-it-katex'],
      exclude: ['vitepress'],
    },
  },

  themeConfig: {
    logo: '/TodoHeap/logo.svg',
    nav: [
      { text: '用户指南', link: '/user/' },
      { text: '开发文档', link: '/dev/' },
      { text: '特性记录', link: '/features/' },
    ],
    sidebar: {
      '/user/': userSidebar,
      '/dev/': devSidebar,
      '/features/': featuresSidebar,
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sherlocknieh/TodoHeap' }
    ],
    footer: {
      message: '文档使用 <a href="https://vitepress.dev/zh/">VitePress</a> 构建',
      copyright: 'Copyright © 2026 TodoHeap',
    },
  },
}))
