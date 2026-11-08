<script setup>
import { computed } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  activeView: { type: String, default: 'list' },
  selectedTaskId: { type: Number, default: null },
  isBreakingDown: { type: Boolean, default: false },
  isOptimizing: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-view', 'create-task', 'breakdown-task', 'optimize-tasks'])

// 为模板提供 `show` 绑定
const show = computed(() => props.show)

const todoStore = useTodoStore()

// 统计信息
const stats = computed(() => ({
  total: todoStore.todos.length,
  completed: todoStore.todos.filter(todo => todo.status === 'done').length,
  pending: todoStore.todos.filter(todo => todo.status !== 'done').length,
  trashed: todoStore.trashTodos.length
}))

// 完成率用于底部进度条
const completionRate = computed(() =>
  stats.value.total ? Math.round((stats.value.completed / stats.value.total) * 100) : 0
)

// 可用视图，回收站与列表、树同属视图层级
const views = computed(() => [
  { id: 'list', label: '列表', icon: 'list' },
  { id: 'tree', label: '树视图', icon: 'tree' },
  { id: 'trash', label: '回收站', icon: 'trash', count: stats.value.trashed }
])

// 切换视图
const switchView = (view) => {
  emit('switch-view', view)
  // 小屏下切换视图后自动关闭侧栏
  if (window.innerWidth < 1024) {
    emit('close')
  }
}


</script>
<template>
  <!-- 小屏浮层 / 大屏常驻左栏 -->
  <div
    v-if="show"
    :class="[
      'absolute top-0 left-0 bottom-0 w-64 max-w-[85vw] bg-white dark:bg-neutral-950 flex flex-col z-30 border-r border-neutral-200 dark:border-neutral-800',
      'lg:static lg:z-10 lg:shadow-none'
    ]"
  >
    <!-- 头部 -->
    <header class="shrink-0 h-11 px-3 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
      <span class="eyebrow">任务导航</span>
      <button
        @click="$emit('close')"
        class="p-1.5 -mr-1.5 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors lg:hidden"
        title="关闭侧栏"
      >
        <AppIcon name="close" :size="15" />
      </button>
    </header>

    <!-- 内容 -->
    <div class="flex-1 min-h-0 overflow-auto px-2 py-3 space-y-6">
      <!-- 视图 -->
      <nav class="space-y-0.5">
        <p class="eyebrow px-2 pb-1.5">视图</p>
        <button
          v-for="view in views"
          :key="view.id"
          @click="switchView(view.id)"
          :class="[
            'w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center gap-2 border-l-2',
            activeView === view.id
              ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium border-accent-600 dark:border-accent-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-200'
          ]"
        >
          <AppIcon :name="view.icon" :size="15" class="opacity-70" />
          <span class="flex-1">{{ view.label }}</span>
          <span v-if="view.count !== undefined" class="font-mono text-[11px] text-neutral-400">{{ view.count }}</span>
        </button>
      </nav>

      <!-- 统计 -->
      <section class="space-y-0.5">
        <p class="eyebrow px-2 pb-1.5">统计</p>
        <div class="px-2 space-y-1.5">
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-neutral-500 dark:text-neutral-500">总任务</span>
            <span class="font-mono text-neutral-900 dark:text-neutral-200">{{ stats.total }}</span>
          </div>
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-neutral-500 dark:text-neutral-500">已完成</span>
            <span class="font-mono text-neutral-900 dark:text-neutral-200">{{ stats.completed }}</span>
          </div>
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-neutral-500 dark:text-neutral-500">进行中</span>
            <span class="font-mono text-neutral-900 dark:text-neutral-200">{{ stats.pending }}</span>
          </div>
        </div>
        <!-- 完成进度 -->
        <div class="px-2 pt-2">
          <div class="h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div class="h-full bg-accent-600 dark:bg-accent-400 transition-[width] duration-300"
              :style="{ width: completionRate + '%' }"></div>
          </div>
        </div>
      </section>

      <!-- AI -->
      <section class="space-y-0.5">
        <p class="eyebrow px-2 pb-1.5">AI</p>
        <button
          class="w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isOptimizing"
          @click="$emit('optimize-tasks')"
        >
          <AppIcon name="sparkles" :size="15" class="opacity-70" />
          <span>{{ isOptimizing ? '任务优化中…' : '全局任务优化' }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
