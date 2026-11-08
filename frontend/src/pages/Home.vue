<script setup>
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

// 站点部署在子路径下，静态资源需带上 base 前缀
const logoSrc = `${import.meta.env.BASE_URL}logo.svg`

// 按登录状态进入应用或引导登录
const openApp = () => {
  router.push({ name: auth.isAuthenticated ? 'app' : 'login' })
}

const features = [
  {
    icon: 'sparkles',
    title: '对话 Agent',
    desc: '一句话说清想做的事，Agent 负责拆解、估时与调整，管理过程几乎不用亲手操作。'
  },
  {
    icon: 'tree',
    title: '任务树',
    desc: '列表与思维导图两种形态，无限层级，拆到多细都能看清彼此的关系。'
  },
  {
    icon: 'calendar',
    title: '落进日程',
    desc: '未完成的任务按截止日期铺进日程，支持 ICS 导入导出与只读订阅链接。'
  }
]
</script>

<template>
  <!-- 落地页：以文字层级承担主要信息，不做装饰性堆叠 -->
  <div class="min-h-screen flex flex-col bg-canvas dark:bg-canvas-dark text-neutral-900 dark:text-neutral-100">
    <header
      class="sticky top-0 z-40 border-b border-hairline dark:border-hairline-dark bg-surface/85 dark:bg-surface-dark/85 backdrop-blur">
      <div class="w-full px-6 md:px-10 lg:px-16 h-14 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <img :src="logoSrc" alt="TodoHeap" class="w-6 h-6" />
          <span class="text-sm font-semibold tracking-tight">TodoHeap</span>
        </div>
        <button class="btn-primary text-xs px-3 py-1.5" @click="openApp">{{ auth.isAuthenticated ? '进入应用' : '登录 / 注册' }}</button>
      </div>
    </header>

    <main class="flex-1">
      <section class="w-full px-6 md:px-10 lg:px-16 pt-24 pb-20">
        <p class="eyebrow text-accent-700 dark:text-accent-400">从任务到日程</p>
        <h1 class="mt-4 text-4xl sm:text-5xl font-semibold leading-[1.15] tracking-tight">
          把模糊的任务，<br class="hidden sm:block" />
          变成排得进日程的下一步。
        </h1>
        <p class="mt-6 max-w-xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
          TodoHeap 用对话 Agent 理解任务、拆成可执行的步骤并排好先后，再铺进日程。
          你不必决定从哪开始，只要按推荐的顺序做完今天的那一件。
        </p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <button class="btn-primary px-4 py-2" @click="openApp">{{ auth.isAuthenticated ? '进入应用' : '免费开始使用' }}</button>
          <a href="/TodoHeap/docs/zh/" class="btn-outline px-4 py-2">看看怎么用</a>
        </div>
      </section>

      <section class="border-t border-hairline dark:border-hairline-dark">
        <div class="w-full px-6 md:px-10 lg:px-16 py-14 grid sm:grid-cols-3 gap-10">
          <div v-for="feature in features" :key="feature.title">
            <AppIcon :name="feature.icon" :size="18" class="text-accent-700 dark:text-accent-400" />
            <h2 class="mt-3 text-sm font-semibold">{{ feature.title }}</h2>
            <p class="mt-1.5 text-sm leading-6 text-neutral-500 dark:text-neutral-400">{{ feature.desc }}</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-hairline dark:border-hairline-dark">
      <div
        class="w-full px-6 md:px-10 lg:px-16 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500">
        <span>© 2026 TodoHeap · 把模糊的任务排进日程</span>
        <nav class="flex items-center gap-4">
          <a href="/TodoHeap/docs/zh/user/" class="hover:text-accent-800 dark:hover:text-accent-200">使用指南</a>
          <a href="/TodoHeap/docs/zh/dev/" class="hover:text-accent-800 dark:hover:text-accent-200">开发文档</a>
        </nav>
      </div>
    </footer>
  </div>
</template>
