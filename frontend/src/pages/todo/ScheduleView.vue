<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTodoStore } from '@/stores/todos'
import { useScheduleStore } from '@/stores/schedules'
import { exportSchedulesIcs, readIcsFile } from '@/lib/calendarTransfer'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected'])

const router = useRouter()
const todoStore = useTodoStore()
const scheduleStore = useScheduleStore()

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

// 日程事件显示时间区间；整日事件（起止都是零点且相差一天）标为全天
const eventTimeLabel = (event) => {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  if (start.getHours() === 0 && start.getMinutes() === 0
    && end.getTime() - start.getTime() === 86400000) return '全天'
  const startText = timeLabel(event.start_at)
  const endText = timeLabel(event.end_at)
  if (!startText) return ''
  return endText ? `${startText}–${endText}` : startText
}

// 同一日期下同时容纳待办与日程事件
const schedule = computed(() => {
  const buckets = new Map()
  const undated = []

  const bucketFor = (value) => {
    const key = dayKey(value)
    if (!buckets.has(key)) buckets.set(key, { key, label: groupLabel(value), tasks: [], events: [] })
    return buckets.get(key)
  }

  for (const todo of todoStore.todos) {
    if (todo.completed_at) continue
    if (!todo.deadline) {
      undated.push(todo)
      continue
    }
    bucketFor(todo.deadline).tasks.push(todo)
  }

  for (const event of scheduleStore.schedules) {
    bucketFor(event.start_at).events.push(event)
  }

  const dated = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
      events: [...group.events].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    }))

  const taskCount = dated.reduce((sum, group) => sum + group.tasks.length, 0) + undated.length
  const eventCount = dated.reduce((sum, group) => sum + group.events.length, 0)

  return {
    dated,
    undated: undated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    taskCount,
    eventCount,
    total: taskCount + eventCount
  }
})

const selectTask = (id) => emit('task-selected', id)

// 导入日历：先预览再写入，成功后 store 会立即反映到列表
const calendarFileInput = ref(null)
const importFileName = ref('')
const importEvents = ref([])
const importSkipped = ref(0)
const importError = ref('')
const importMessage = ref('')
const isImporting = ref(false)
const importDone = ref(false)

const loadImportFile = async (file) => {
  if (!file) return

  importError.value = ''
  importMessage.value = ''
  importDone.value = false
  importEvents.value = []
  importSkipped.value = 0
  importFileName.value = file.name

  try {
    const { events, skipped } = await readIcsFile(file)
    importEvents.value = events
    importSkipped.value = skipped
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '解析日历失败'
    importFileName.value = ''
  }
}

const handleFileChange = (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  loadImportFile(file)
}

const resetImport = () => {
  if (calendarFileInput.value) calendarFileInput.value.value = ''
  importFileName.value = ''
  importEvents.value = []
  importSkipped.value = 0
  importError.value = ''
  importMessage.value = ''
  importDone.value = false
  isImporting.value = false
}

const handleImport = async () => {
  if (isImporting.value || importDone.value || !importEvents.value.length) return

  if (!navigator.onLine) {
    importError.value = '当前离线，恢复网络后再导入'
    return
  }

  importError.value = ''
  isImporting.value = true
  try {
    const result = await scheduleStore.createSchedules(importEvents.value)
    if (!result.success) throw new Error(result.error)
    importMessage.value = `已导入 ${result.data.length} 个日程`
    importDone.value = true
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '导入日程失败'
    importDone.value = true
  } finally {
    isImporting.value = false
  }
}

const handleExport = async () => {
  importError.value = ''
  importMessage.value = ''
  try {
    const result = await scheduleStore.fetchSchedules({ force: true })
    if (!result.success) throw new Error(result.error)
    exportSchedulesIcs(result.data)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '导出失败'
  }
}

const handleDeleteEvent = async (event) => {
  if (!window.confirm(`删除日程「${event.title}」吗？`)) return

  const result = await scheduleStore.deleteSchedule(event.id)
  if (!result.success) {
    importError.value = result.error || '删除日程失败'
  }
}

onMounted(() => {
  scheduleStore.fetchSchedules()
})
</script>

<template>
  <!-- 日程：按日期排出来自任务的截止时间与日历事件 -->
  <div class="panel p-4 text-neutral-900 dark:text-neutral-100">
    <header class="flex flex-wrap items-center gap-2 pb-1">
      <AppIcon name="calendar" :size="15" class="text-neutral-400 dark:text-neutral-600" />
      <h1 class="text-sm font-semibold">日程</h1>
      <span class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
        {{ schedule.eventCount }} 个日程 · {{ schedule.taskCount }} 项待办
      </span>

      <div class="ml-auto flex items-center gap-1.5">
        <label class="btn-outline cursor-pointer">
          <input ref="calendarFileInput" type="file" accept=".ics,text/calendar" class="sr-only" @change="handleFileChange" />
          <AppIcon name="upload" :size="14" />
          <span>导入</span>
        </label>
        <button class="btn-outline" @click="handleExport">
          <AppIcon name="download" :size="14" />
          <span>导出</span>
        </button>
        <button class="btn-outline" @click="router.push({ name: 'settings', query: { tab: 'calendar' } })">
          <AppIcon name="link" :size="14" />
          <span>订阅</span>
        </button>
      </div>
    </header>

    <p v-if="importError" class="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
      <AppIcon name="alert" :size="12" />
      <span>{{ importError }}</span>
    </p>
    <p v-if="importMessage" class="mt-2 flex items-center gap-1.5 text-xs text-accent-700 dark:text-accent-400">
      <AppIcon name="check" :size="12" />
      <span>{{ importMessage }}</span>
    </p>

    <!-- 导入预览：确认事件数量后再写入 -->
    <div v-if="importEvents.length" class="mt-3 rounded-md border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip">{{ importFileName }}</span>
        <span class="chip">{{ importEvents.length }} 个事件</span>
        <span v-if="importSkipped" class="chip">{{ importSkipped }} 个无法解析</span>
      </div>
      <ul class="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <li v-for="event in importEvents.slice(0, 3)" :key="`${event.start_at}-${event.title}`" class="flex items-center gap-2">
          <span class="font-mono text-neutral-400">{{ formatMonthDay(event.start_at) }}</span>
          <span class="truncate">{{ event.title }}</span>
        </li>
        <li v-if="importEvents.length > 3" class="text-neutral-400">等 {{ importEvents.length }} 个事件</li>
      </ul>
      <div class="mt-2 flex items-center gap-2">
        <button class="btn-primary" :disabled="isImporting || importDone" @click="handleImport">
          <AppIcon name="upload" :size="14" />
          <span>{{ isImporting ? '导入中…' : (importDone ? '已导入' : '开始导入') }}</span>
        </button>
        <button class="btn-outline" @click="resetImport">取消</button>
      </div>
    </div>

    <!-- 空状态 -->
    <section v-if="schedule.total === 0" class="py-16 text-center">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">还没有安排到日程上的任务或事件</p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">在任务详情里设置截止时间，或导入 ICS 日历</p>
    </section>

    <div v-else class="mt-2 space-y-4">
      <section v-for="group in schedule.dated" :key="group.key" class="space-y-1">
        <p class="px-1 text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
          {{ group.label }}
          <span class="ml-1 font-mono text-neutral-400 dark:text-neutral-600">{{ group.events.length + group.tasks.length }}</span>
        </p>
        <ul class="space-y-px">
          <li v-for="event in group.events" :key="`event-${event.id}`"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-neutral-600 transition-colors hover:bg-accent-50/70 dark:text-neutral-400 dark:hover:bg-accent-500/[0.06]">
            <AppIcon name="calendar" :size="13" class="shrink-0 text-accent-600 dark:text-accent-400" />
            <span class="flex-1 truncate">{{ event.title || '未命名日程' }}</span>
            <span class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ eventTimeLabel(event) }}</span>
            <button class="rounded p-0.5 text-neutral-400 opacity-0 transition-opacity hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:hover:text-rose-400"
              aria-label="删除日程" @click="handleDeleteEvent(event)">
              <AppIcon name="trash" :size="12" />
            </button>
          </li>
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
