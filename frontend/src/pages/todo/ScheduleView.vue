<script setup>
import { computed } from 'vue'
import { useTodoStore } from '@/stores/todos'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected'])

const todoStore = useTodoStore()

const startOfDay = (value) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

// 以本地日期为分组键，避免跨时区把同一自然日拆开
const dayKey = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const formatMonthDay = (value) => {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const weekdayLabel = (value) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(value).getDay()]

// 近期日期用相对说法，其余直接给月日与星期
const groupLabel = (value) => {
  const today = startOfDay(new Date())
  const diffDays = Math.round((startOfDay(value) - today) / 86400000)
  if (diffDays < 0) return `逾期 · ${formatMonthDay(value)}`
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  return `${formatMonthDay(value)} · ${weekdayLabel(value)}`
}

const timeLabel = (value) => {
  const date = new Date(value)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  if (hours === 0 && minutes === 0) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// 日程只看未完成任务：有截止时间的按日期分组，其余收在末尾
const schedule = computed(() => {
  const buckets = new Map()
  const undated = []

  for (const todo of todoStore.todos) {
    if (todo.completed_at) continue
    if (!todo.deadline) {
      undated.push(todo)
      continue
    }
    const key = dayKey(todo.deadline)
    if (!buckets.has(key)) buckets.set(key, { key, label: groupLabel(todo.deadline), tasks: [] })
    buckets.get(key).tasks.push(todo)
  }

  const dated = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(group => ({
      ...group,
      tasks: group.tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    }))

  return {
    dated,
    undated: undated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    total: dated.reduce((sum, group) => sum + group.tasks.length, 0) + undated.length
  }
})

const selectTask = (id) => emit('task-selected', id)
</script>

<template>
  <!-- 日程：按截止日期排出接下来要做的事 -->
  <div class="panel p-4 text-neutral-900 dark:text-neutral-100">
    <header class="flex items-center gap-2 pb-1">
      <AppIcon name="calendar" :size="15" class="text-neutral-400 dark:text-neutral-600" />
      <h1 class="text-sm font-semibold">日程</h1>
      <span class="ml-auto font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ schedule.total }} 项待办</span>
    </header>

    <!-- 空状态 -->
    <section v-if="schedule.total === 0" class="py-16 text-center">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">还没有安排到日程上的任务</p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">在任务详情里设置截止时间，就会出现在这里</p>
    </section>

    <div v-else class="mt-2 space-y-4">
      <section v-for="group in schedule.dated" :key="group.key" class="space-y-1">
        <p class="px-1 text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
          {{ group.label }}
          <span class="ml-1 font-mono text-neutral-400 dark:text-neutral-600">{{ group.tasks.length }}</span>
        </p>
        <ul class="space-y-px">
          <li v-for="todo in group.tasks" :key="todo.id" @click="selectTask(todo.id)"
            :class="[
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
              selectedTaskId === todo.id
                ? 'bg-accent-50 text-accent-900 dark:bg-accent-500/10 dark:text-accent-100'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'
            ]">
            <input type="checkbox"
              class="h-3.5 w-3.5 rounded border-accent-300 accent-accent-600 dark:accent-accent-400"
              @click.stop @change="todoStore.toggleDone(todo.id)" />
            <span class="flex-1 truncate">{{ todo.title || '未命名任务' }}</span>
            <span v-if="timeLabel(todo.deadline)" class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
              {{ timeLabel(todo.deadline) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 未安排时间的待办 -->
      <section v-if="schedule.undated.length" class="space-y-1">
        <p class="px-1 text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
          未设置截止时间
          <span class="ml-1 font-mono text-neutral-400 dark:text-neutral-600">{{ schedule.undated.length }}</span>
        </p>
        <ul class="space-y-px">
          <li v-for="todo in schedule.undated" :key="todo.id" @click="selectTask(todo.id)"
            :class="[
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
              selectedTaskId === todo.id
                ? 'bg-accent-50 text-accent-900 dark:bg-accent-500/10 dark:text-accent-100'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'
            ]">
            <input type="checkbox"
              class="h-3.5 w-3.5 rounded border-accent-300 accent-accent-600 dark:accent-accent-400"
              @click.stop @change="todoStore.toggleDone(todo.id)" />
            <span class="flex-1 truncate">{{ todo.title || '未命名任务' }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
