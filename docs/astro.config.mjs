import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// 站点占据 /TodoHeap/ 根路径：/ 是落地页，其余是文档，应用在 /app/ 子路径。
// 构建输出 dist/（会清空），前端随后输出 dist/app/。
export default defineConfig({
  site: 'https://sherlocknieh.github.io',
  base: '/TodoHeap',
  outDir: '../dist',
  // 开发期把 /app 转发到前端 dev server（5200）：生产环境 /app 是构建产物目录，
  // 但两个 dev server 分端口运行，文档站点本身没有这条路由。
  vite: {
    server: {
      proxy: {
        // Astro 会先剥掉 base，代理看到的是 /app/*
        '/app': {
          target: 'http://localhost:5200',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => '/TodoHeap' + path,
        },
      },
    },
  },
  integrations: [
    starlight({
      title: 'TodoHeap 任务堆',
      description: 'TodoHeap 文档：AI 驱动的任务与日程管理',
      logo: { src: './src/assets/logo.svg', alt: 'TodoHeap' },
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/TodoHeap/logo.svg' } },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/sherlocknieh/TodoHeap' },
      ],
      editLink: {
        baseUrl: 'https://github.com/sherlocknieh/TodoHeap/edit/main/docs/',
      },
      // 侧栏显式声明：slug 即内容文件的相对路径，加页面时补一行
      sidebar: [
        {
          label: '用户指南',
          items: [
            { label: '用户指南', slug: 'user' },
            { label: '任务管理详解', slug: 'user/task-management' },
            { label: 'AI 智能功能', slug: 'user/ai-features' },
            { label: '视图详解', slug: 'user/views' },
            { label: '数据同步与离线使用', slug: 'user/sync-offline' },
            { label: '常见问题 (FAQ)', slug: 'user/faq' },
            { label: '日历导入导出与订阅', slug: 'user/calendar' },
          ],
        },
        {
          label: '开发文档',
          items: [
            { label: '开发指南', slug: 'dev' },
            { label: '项目愿景与方案', slug: 'dev/goals' },
            { label: '环境搭建指南', slug: 'dev/setup' },
            { label: '架构与技术栈', slug: 'dev/architecture' },
            { label: '开发流程与常见任务', slug: 'dev/development' },
            { label: '代码地图', slug: 'dev/code-map' },
            { label: '关键词索引', slug: 'dev/keyword-index' },
            {
              label: '逻辑文档',
              items: [
                { label: '索引', slug: 'dev/logic' },
                { label: '任务创建逻辑', slug: 'dev/logic/task-create' },
                { label: '任务图布局逻辑', slug: 'dev/logic/mindmap-layout' },
                { label: '节点文字折行与节点高度', slug: 'dev/logic/mindmap-text-wrap' },
                { label: '侧栏开合与窗口宽度', slug: 'dev/logic/layout-sidebar' },
                { label: '详情右栏与任务图布局', slug: 'dev/logic/layout-detail-panel' },
              ],
            },
          ],
        },
        {
          label: '特性记录',
          items: [
            { label: '功能现状', slug: 'features' },
            { label: '任务与层级', slug: 'features/tasks' },
            { label: '视图与交互', slug: 'features/views' },
            { label: 'AI 能力', slug: 'features/ai' },
            { label: '日历与订阅', slug: 'features/calendar' },
            { label: '同步与设置', slug: 'features/sync-settings' },
          ],
        },
      ],
    }),
  ],
})
