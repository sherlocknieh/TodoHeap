<script setup>
import AITaskInput from '@/components/AITaskInput.vue'
import AppIcon from '@/components/AppIcon.vue'

defineProps({
  loading: { type: Boolean, default: false },
  progress: { type: Object, default: () => ({}) },
  isOptimizing: { type: Boolean, default: false }
})

const emit = defineEmits(['submit-task', 'optimize-tasks'])
</script>

<template>
  <!-- AI 工作台：收拢自然语言建任务与全局优化两个入口 -->
  <div class="panel p-4 space-y-4 w-full max-w-xl mx-auto">
    <header class="flex items-start gap-2.5">
      <AppIcon name="sparkles" :size="18" class="mt-0.5 text-accent-700 dark:text-accent-400" />
      <div>
        <h1 class="text-sm font-semibold">用一句话开始</h1>
        <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          描述目标，AI 会拆成能立刻动手的任务，并补上优先级与截止时间。
        </p>
      </div>
    </header>

    <AITaskInput :loading="loading" :progress="progress" @submit-task="emit('submit-task', $event)" />

    <section class="border-t border-hairline dark:border-hairline-dark pt-3 space-y-2">
      <div>
        <h2 class="text-sm font-semibold">全局任务优化</h2>
        <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          让 AI 按当前清单重新排序，并修正重复或含糊的任务。
        </p>
      </div>
      <button class="btn-outline px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="isOptimizing" @click="emit('optimize-tasks')">
        <AppIcon name="sparkles" :size="14" />
        <span>{{ isOptimizing ? '任务优化中…' : '开始优化' }}</span>
      </button>
    </section>
  </div>
</template>
