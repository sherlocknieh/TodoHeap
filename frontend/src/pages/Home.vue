<script setup>
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'

const router = useRouter()

const openLogin = () => {
  router.push({ name: 'login' })
}

const features = [
  {
    icon: 'sparkles',
    title: 'AI 自动分解',
    desc: '把含糊的大目标拆成能立刻动手的小任务，每一步都有明确边界。'
  },
  {
    icon: 'layers',
    title: '堆结构排序',
    desc: '按优先级排出先后，最该做的那件始终在顶部，省掉反复权衡。'
  },
  {
    icon: 'cloud',
    title: '云端同步',
    desc: '本地先写，联网自动同步，多设备看到的是同一份清单。'
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
          <img src="/logo.png" alt="TodoHeap" class="w-6 h-6 rounded" />
          <span class="text-sm font-semibold tracking-tight">TodoHeap</span>
        </div>
        <button class="btn-primary text-xs px-3 py-1.5" @click="openLogin">登录 / 注册</button>
      </div>
    </header>

    <main class="flex-1">
      <section class="w-full px-6 md:px-10 lg:px-16 pt-24 pb-20">
        <p class="eyebrow text-accent-700 dark:text-accent-400">任务管理</p>
        <h1 class="mt-4 text-4xl sm:text-5xl font-semibold leading-[1.15] tracking-tight">
          把大任务拆小，<br class="hidden sm:block" />
          只做此刻最该做的那一件。
        </h1>
        <p class="mt-6 max-w-xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
          TodoHeap 用 AI 分解任务，用堆结构决定先后顺序。你不必在等价的清单里反复挑选，随时知道下一步做什么。
        </p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <button class="btn-primary px-4 py-2" @click="openLogin">开始使用</button>
          <a href="/TodoHeap/docs/zh/" class="btn-outline px-4 py-2">阅读文档</a>
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
        <span>© 2026 TodoHeap</span>
        <nav class="flex items-center gap-4">
          <a href="/TodoHeap/docs/zh/user/" class="hover:text-accent-800 dark:hover:text-accent-200">使用指南</a>
          <a href="/TodoHeap/docs/zh/dev/" class="hover:text-accent-800 dark:hover:text-accent-200">开发文档</a>
        </nav>
      </div>
    </footer>
  </div>
</template>
