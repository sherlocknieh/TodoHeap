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
  // 当前活动栏入口，决定侧栏内容
  section: { type: String, default: 'list' },
  isOptimizing: { type: Boolean, default: false },
  // 覆盖在内容之上，不挤压主视图（树视图使用）
  overlay: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-view', 'create-task', 'breakdown-task', 'optimize-tasks'])

// 为模板提供 `show` 绑定
const show = computed(() => props.show)

const todoStore = useTodoStore()

// 统计信息
const stats = computed(() => ({
  total: todoStore.todos.length,
  completed: todoStore.todos.filter(todo => todo.completed_at).length,
  pending: todoStore.todos.filter(todo => !todo.completed_at).length,
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

// 按活动栏入口展示不同标题与内容
const sectionTitle = computed(() => {
  if (props.section === 'schedule') return '日程'
  if (props.section === 'ai') return 'AI'
  return '任务导航'
})

// 日程侧栏的概览：只统计未完成任务
const scheduleStats = computed(() => {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  let overdue = 0
  let today = 0
  let upcoming = 0
  let undated = 0

  for (const todo of todoStore.todos) {
    if (todo.completed_at) continue
    if (!todo.deadline) {
      undated += 1
      continue
    }
    const deadline = new Date(todo.deadline)
    if (deadline < startOfToday) overdue += 1
    else if (deadline <= endOfToday) today += 1
    else upcoming += 1
  }

  return { overdue, today, upcoming, undated }
})

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
      'absolute top-0 bottom-0 left-12 w-64 max-w-[85vw] bg-surface dark:bg-surface-dark flex flex-col z-30 border-r border-hairline dark:border-hairline-dark',
      overlay ? 'shadow-lg' : 'lg:static lg:z-10 lg:shadow-none'
    ]"
  >
    <!-- 头部 -->
    <header class="shrink-0 h-11 px-3 flex items-center justify-between border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">{{ sectionTitle }}</span>
      <button
        @click="$emit('close')"
        :class="[
          'p-1.5 -mr-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors',
          overlay ? '' : 'lg:hidden'
        ]"
        title="关闭侧栏"
      >
        <AppIcon name="close" :size="15" />
      </button>
    </header>

    <!-- 内容：按活动栏入口切换 -->
    <div class="flex-1 min-h-0 overflow-auto px-2 py-3 space-y-6">
      <template v-if="section === 'list'">
        <!-- 视图 -->
        <nav class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">视图</p>
          <button
            v-for="view in views"
            :key="view.id"
            @click="switchView(view.id)"
            :class="[
              'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 border-l-2',
              activeView === view.id
                ? 'bg-accent-100/80 text-accent-900 dark:bg-accent-500/20 dark:text-accent-100 font-semibold border-accent-600 dark:border-accent-400'
                : 'border-transparent text-neutral-700 dark:text-neutral-300 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06] hover:text-accent-800 dark:hover:text-accent-200'
            ]"
          >
            <AppIcon :name="view.icon" :size="15" class="opacity-70" />
            <span class="flex-1">{{ view.label }}</span>
            <span v-if="view.count !== undefined" class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ view.count }}</span>
          </button>
        </nav>

        <!-- 统计 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">统计</p>
          <div class="px-2 space-y-1.5">
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">总任务</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ stats.total }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">已完成</span>
              <span class="font-mono text-accent-700 dark:text-accent-400">{{ stats.completed }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">进行中</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ stats.pending }}</span>
            </div>
          </div>
          <!-- 完成进度 -->
          <div class="px-2 pt-2">
            <div class="h-1.5 rounded-full bg-accent-100 dark:bg-accent-500/15 overflow-hidden">
              <div class="h-full rounded-full bg-accent-500 dark:bg-accent-400 transition-[width] duration-300"
                :style="{ width: completionRate + '%' }"></div>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="section === 'schedule'">
        <!-- 日程概览 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">概览</p>
          <div class="px-2 space-y-1.5">
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">逾期</span>
              <span class="font-mono" :class="scheduleStats.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-900 dark:text-neutral-100'">{{ scheduleStats.overdue }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">今天</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ scheduleStats.today }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">以后</span>
              <span class="font-mono text-neutral-900 dark:text-neutral-100">{{ scheduleStats.upcoming }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">未设置时间</span>
              <span class="font-mono text-neutral-900 dark:text-neutral-100">{{ scheduleStats.undated }}</span>
            </div>
          </div>
        </section>

        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">说明</p>
          <p class="px-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            在任务详情里设置截止时间后，会按日期出现在日程中；勾选完成即从日程移除。
          </p>
        </section>
      </template>

      <template v-else>
        <!-- AI 操作 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">操作</p>
          <button
            class="w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06] hover:text-accent-800 dark:hover:text-accent-200 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isOptimizing"
            @click="$emit('optimize-tasks')"
          >
            <AppIcon name="sparkles" :size="15" class="opacity-70" />
            <span>{{ isOptimizing ? '任务优化中…' : '全局任务优化' }}</span>
          </button>
        </section>

        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">说明</p>
          <p class="px-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            用一句话描述目标，AI 会拆成可执行任务；也可以让 AI 重新排序当前清单。
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
