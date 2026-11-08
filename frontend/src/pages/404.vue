<template>
  <!-- 404 页面 -->
  <div class="min-h-screen flex items-center justify-center p-6 bg-canvas dark:bg-canvas-dark">
    <div class="text-center">
      <p class="font-mono text-xs tracking-[0.2em] text-neutral-400">404</p>
      <h1 class="mt-3 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">页面未找到</h1>
      <p class="mt-2 text-sm text-neutral-500">你访问的页面不存在或已被删除</p>

      <div class="mt-8 flex items-center justify-center gap-3">
        <button class="btn-primary" @click="goHome">返回首页</button>
        <button class="btn-outline" @click="goBack">返回上一页</button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { useRouter } from 'vue-router'

  const router = useRouter()

  const goHome = () => {
    router.push({ name: 'home' })
  }

  const goBack = () => {
    router.back()
  }
</script>
