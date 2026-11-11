<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScheduleStore } from '@/stores/schedules'
import { exportSchedulesIcs, readIcsFile } from '@/lib/calendarTransfer'
import { parseDateKey, toDateKey } from '@/utils/scheduleRange'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedEventId: { type: [Number, String], default: null }
})

const emit = defineEmits(['event-selected'])

const route = useRoute()
const router = useRouter()
const scheduleStore = useScheduleStore()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

// 选中日期由路由 query 承载，刷新或从侧栏跳转后仍停在同一天
const selectedDate = computed(() => parseDateKey(route.query.date) || new Date())
const selectedKey = computed(() => toDateKey(selectedDate.value))
const todayKey = toDateKey(new Date())
const isToday = computed(() => selectedKey.value === todayKey)

const goToDate = (date) => {
  if (!date) return
  router.replace({ name: 'ScheduleView', query: { date: toDateKey(date) } })
}

const shiftDay = (delta) => {
  const next = new Date(selectedDate.value)
  next.setDate(next.getDate() + delta)
  goToDate(next)
}

const formatMonthDay = (value) => {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const weekdayLabel = (value) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(value).getDay()]

const selectedLabel = computed(() => {
  const date = selectedDate.value
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekdayLabel(date)}`
})

const timeLabel = (value) => {
  const date = new Date(value)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  if (hours === 0 && minutes === 0) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// 卡片左侧的时间列；整日事件（起止零点且跨一天）只显示一次「全天」
const eventTimes = (event) => {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  if (start.getHours() === 0 && start.getMinutes() === 0
    && end.getTime() - start.getTime() === 86400000) return { start: '全天', end: '' }
  return { start: timeLabel(event.start_at), end: timeLabel(event.end_at) }
}

// 跨天事件归入开始日，与月历圆点口径保持一致
const dayEvents = computed(() => scheduleStore.schedules
  .filter((event) => toDateKey(event.start_at) === selectedKey.value)
  .sort((a, b) => new Date(a.start_at) - new Date(b.start_at)))

// 每天的事件数，用作月历上的圆点
const eventCountByDay = computed(() => {
  const counts = new Map()
  for (const event of scheduleStore.schedules) {
    const key = toDateKey(event.start_at)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
})

// 月历只渲染选中日期所在月份，周一起头
const monthGrid = computed(() => {
  const base = selectedDate.value
  const year = base.getFullYear()
  const month = base.getMonth()
  const leading = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: leading }, () => null)

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = toDateKey(new Date(year, month, day))
    cells.push({ key, day, count: eventCountByDay.value.get(key) || 0 })
  }
  return { label: `${year}年${month + 1}月`, cells }
})

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

// 选中日程交给右栏详情面板编辑，列表只负责点选
const selectEvent = (event) => {
  emit('event-selected', event.id)
}

onMounted(() => {
  scheduleStore.fetchSchedules()
})
</script>

<template>
  <!-- 日程：按日期排出 schedules 中的日历事件 -->
  <div class="panel p-4 text-neutral-900 dark:text-neutral-100">
    <!-- 页面操作：日程数量与导入、导出、订阅入口放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <span class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ dayEvents.length }} 个日程</span>
      <div class="flex shrink-0 items-center gap-1.5">
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
    </Teleport>

    <!-- 日期导航：左右翻页切换前后一天，点「今天」回到当天 -->
    <section class="rounded-md border border-hairline dark:border-hairline-dark">
      <div class="flex items-center gap-1.5 px-3 py-2">
        <button class="rounded p-1 text-neutral-500 transition-colors hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
          aria-label="前一天" @click="shiftDay(-1)">
          <AppIcon name="chevronLeft" :size="15" />
        </button>
        <span class="text-sm font-medium">{{ selectedLabel }}</span>
        <button class="rounded p-1 text-neutral-500 transition-colors hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
          aria-label="后一天" @click="shiftDay(1)">
          <AppIcon name="chevronRight" :size="15" />
        </button>
        <button v-if="!isToday" class="btn-outline ml-auto" @click="goToDate(new Date())">今天</button>
      </div>

      <!-- 月历总览：圆点标记有日程的日子，点击直接切到那天 -->
      <div class="border-t border-hairline px-3 py-2 dark:border-hairline-dark">
        <p class="mx-auto max-w-md pb-1 text-center text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">{{ monthGrid.label }}</p>
        <div class="mx-auto grid max-w-md grid-cols-7 gap-1 text-center">
          <span v-for="weekday in WEEKDAYS" :key="weekday" class="py-0.5 text-[10px] text-neutral-400 dark:text-neutral-600">{{ weekday }}</span>
          <template v-for="(cell, index) in monthGrid.cells" :key="index">
            <span v-if="!cell" aria-hidden="true"></span>
            <button v-else type="button"
              class="relative flex h-8 flex-col items-center justify-center rounded text-xs transition-colors"
              :class="cell.key === selectedKey
                ? 'bg-accent-600 text-white'
                : cell.key === todayKey
                  ? 'text-accent-700 ring-1 ring-inset ring-accent-300 dark:text-accent-300 dark:ring-accent-700'
                  : 'text-neutral-600 hover:bg-accent-50 dark:text-neutral-400 dark:hover:bg-accent-500/10'"
              @click="goToDate(parseDateKey(cell.key))">
              {{ cell.day }}
              <span v-if="cell.count" class="absolute bottom-0.5 h-1 w-1 rounded-full"
                :class="cell.key === selectedKey ? 'bg-white' : 'bg-accent-500'"></span>
            </button>
          </template>
        </div>
      </div>
    </section>

    <p v-if="importError" class="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
      <AppIcon name="alert" :size="12" />
      <span>{{ importError }}</span>
    </p>
    <p v-if="importMessage" class="mt-2 flex items-center gap-1.5 text-xs text-accent-700 dark:text-accent-400">
      <AppIcon name="check" :size="12" />
      <span>{{ importMessage }}</span>
    </p>

    <!-- 导入预览：确认事件数量后再写入，成功后收起只留结果提示 -->
    <div v-if="importEvents.length && !importDone" class="mt-3 rounded-md border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
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
        <button class="btn-primary" :disabled="isImporting" @click="handleImport">
          <AppIcon name="upload" :size="14" />
          <span>{{ isImporting ? '导入中…' : '开始导入' }}</span>
        </button>
        <button class="btn-outline" @click="resetImport">取消</button>
      </div>
    </div>

    <!-- 当天日程：时间在左、内容在右，notes 一并展示 -->
    <section class="mt-4">
      <p class="px-1 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
        当天日程
        <span class="ml-1 font-mono text-neutral-400 dark:text-neutral-600">{{ dayEvents.length }}</span>
      </p>
      <!-- 首次载入时先给状态，避免空状态一闪而过 -->
      <div v-if="scheduleStore.loading" class="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500 dark:text-neutral-400">
        <AppIcon name="loader" :size="14" class="animate-spin" />
        <span>读取日程…</span>
      </div>

      <ul v-else-if="dayEvents.length" class="space-y-2">
        <li v-for="event in dayEvents" :key="event.id"
          class="group flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors"
          :class="String(event.id) === String(props.selectedEventId)
            ? 'border-accent-400 bg-accent-50/60 dark:border-accent-600 dark:bg-accent-500/[0.08]'
            : 'border-hairline bg-neutral-50/60 hover:border-accent-400 hover:bg-accent-50/40 dark:border-hairline-dark dark:bg-neutral-900/40 dark:hover:border-accent-600 dark:hover:bg-accent-500/[0.06]'"
          @click="selectEvent(event)">
          <div class="flex w-14 shrink-0 flex-col font-mono text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            <span>{{ eventTimes(event).start }}</span>
            <span class="text-neutral-400 dark:text-neutral-600">{{ eventTimes(event).end }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-neutral-900 dark:text-neutral-100">{{ event.title || '未命名日程' }}</p>
            <p v-if="event.notes" class="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{{ event.notes }}</p>
          </div>
        </li>
      </ul>

      <!-- 空状态：当天没有安排 -->
      <div v-else class="rounded-md border border-dashed border-neutral-200 py-10 text-center dark:border-neutral-800">
        <AppIcon name="calendar" :size="18" class="mx-auto text-neutral-300 dark:text-neutral-700" />
        <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{{ isToday ? '今天没有日程' : '这天没有日程' }}</p>
        <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">用左右箭头或上面的月历切换日期</p>
      </div>
    </section>

  </div>
</template>
