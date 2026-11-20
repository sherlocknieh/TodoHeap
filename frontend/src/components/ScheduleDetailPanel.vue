<script setup>
import { computed, ref, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedules'
import { toDateTimeLocalValue } from '@/utils/deadline'
import { useResizablePanel } from '@/utils/resizablePanel'
import AppIcon from '@/components/AppIcon.vue'
import DateTimePicker from '@/components/DateTimePicker.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  eventId: { type: [Number, String], default: null }
})

const emit = defineEmits(['close', 'event-deleted', 'saved'])

const scheduleStore = useScheduleStore()

// 与任务详情面板同款拖拽调宽，宽度独立保存
const { width: panelWidth, resizing: panelResizing, collapseArmed: panelCollapseArmed, start: startResize } = useResizablePanel({
  key: 'schedule-detail-width',
  initial: 320,
  min: 260,
  side: 'right',
  onCollapse: () => emit('close')
})

const event = computed(() => {
  if (props.eventId == null) return null
  return scheduleStore.schedules.find(item => String(item.id) === String(props.eventId)) || null
})

const STATUS_OPTIONS = [
  { value: 'confirmed', label: '已确认' },
  { value: 'tentative', label: '待定' },
  { value: 'cancelled', label: '已取消' }
]

const COLOR_OPTIONS = [
  { value: '', label: '默认' },
  { value: '#2563eb', label: '蓝色' },
  { value: '#059669', label: '绿色' },
  { value: '#ea580c', label: '橙色' },
  { value: '#7c3aed', label: '紫色' },
  { value: '#dc2626', label: '红色' },
  { value: '#64748b', label: '灰色' }
]

const pad = (value) => String(value).padStart(2, '0')

// 全天事件是 UTC 零点上的日期值；定时事件按本地日期换算
const toDateValue = (value, utc = false) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = utc ? date.getUTCMonth() : date.getMonth()
  const day = utc ? date.getUTCDate() : date.getDate()
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

const toUtcMidnight = (dateValue) => {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const toLocalMidnight = (dateValue) => {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

const splitList = (value) => String(value ?? '')
  .split(/[,，;；]/)
  .map((item) => item.trim())
  .filter(Boolean)

const parseReminders = (value) => [...new Set(String(value ?? '')
  .split(/[,，\s]+/)
  .map((item) => Number.parseInt(item, 10))
  .filter((item) => Number.isInteger(item) && item >= 0))]
  .sort((a, b) => a - b)

const form = ref({
  title: '',
  notes: '',
  location: '',
  url: '',
  attendees: '',
  status: 'confirmed',
  color: '',
  reminders: '',
  all_day: false,
  start_at: '',
  end_at: '',
  duration: '',
  start_date: '',
  end_date: ''
})
const errorMessage = ref('')
const isSaving = ref(false)

// 常用时长：点一下按开始时间算出结束时间
const DURATION_PRESETS = [
  { label: '30 分钟', hours: 0.5 },
  { label: '1 小时', hours: 1 },
  { label: '2 小时', hours: 2 },
  { label: '3 小时', hours: 3 }
]

// 「更多选项」折叠：链接、状态、颜色与提醒默认收起，减少右栏高度
const showMore = ref(false)

// 这些字段有非默认值时自动展开，避免把已有内容藏起来
const hasMoreValues = (item) => Boolean(
  item.url
  || (item.status && item.status !== 'confirmed')
  || item.color
  || (item.reminder_minutes || []).length
)

const emptyForm = () => ({
  title: '',
  notes: '',
  location: '',
  url: '',
  attendees: '',
  status: 'confirmed',
  color: '',
  reminders: '',
  all_day: false,
  start_at: '',
  end_at: '',
  duration: '',
  start_date: '',
  end_date: ''
})

// 起止时间换算出小时数；跨天或非法区间返回 null
const hoursBetween = (startValue, endValue) => {
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
  return Math.round(((end - start) / 3600000) * 100) / 100
}

// 按开始时间加时长算出结束时间；时长非法时不改动草稿
const applyDuration = (hours) => {
  if (!(hours > 0)) return false
  const start = new Date(form.value.start_at)
  if (Number.isNaN(start.getTime())) return false
  form.value.end_at = toDateTimeLocalValue(new Date(start.getTime() + hours * 3600000))
  return true
}

// 结束时间改动后把时长回填成实际间隔
const syncDurationFromRange = () => {
  const hours = hoursBetween(form.value.start_at, form.value.end_at)
  form.value.duration = hours == null ? '' : String(hours)
}

const applyDurationInput = () => {
  const hours = Number(form.value.duration)
  if (!(hours > 0)) {
    syncDurationFromRange()
    return
  }
  form.value.duration = String(hours)
  applyDuration(hours)
}

const setDuration = (hours) => {
  form.value.duration = String(hours)
  applyDuration(hours)
}

// 开始时间确定后按当前时长顺延结束时间；没有时长就按原区间回填
const onStartConfirmed = () => {
  if (!applyDuration(Number(form.value.duration))) syncDurationFromRange()
}

// 切换选中日程时重置草稿，未保存的编辑不会带到另一条日程
const resetForm = (item) => {
  errorMessage.value = ''
  isSaving.value = false
  if (!item) {
    form.value = emptyForm()
    showMore.value = false
    return
  }

  showMore.value = hasMoreValues(item)
  const endBefore = new Date(new Date(item.end_at).getTime() - 1)
  form.value = {
    title: item.title || '',
    notes: item.notes || '',
    location: item.location || '',
    url: item.url || '',
    attendees: (item.attendees || []).join(', '),
    status: item.status || 'confirmed',
    color: item.color || '',
    reminders: (item.reminder_minutes || []).join(', '),
    all_day: Boolean(item.all_day),
    start_at: toDateTimeLocalValue(item.start_at),
    end_at: toDateTimeLocalValue(item.end_at),
    duration: item.all_day ? '' : String(hoursBetween(item.start_at, item.end_at) ?? ''),
    start_date: toDateValue(item.start_at, item.all_day),
    end_date: toDateValue(endBefore, item.all_day)
  }
}

// 选中日程或数据到达时重置草稿；保存后的回写不打断正在编辑的内容
watch(() => [props.eventId, event.value?.id], () => resetForm(event.value), { immediate: true })

// 勾选全天后把当前时间折算成日期，取消时再折回零点区间
const toggleAllDay = (checked) => {
  if (checked) {
    form.value.start_date = toDateValue(form.value.start_at)
    form.value.end_date = toDateValue(new Date(new Date(form.value.end_at).getTime() - 1))
    return
  }
  const start = toLocalMidnight(form.value.start_date)
  const endDate = toLocalMidnight(form.value.end_date)
  // 日期被清空时保留原来的时间输入，避免生成 Invalid Date
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDate.getTime())) return
  const end = new Date(endDate.getTime() + 86400000)
  form.value.start_at = toDateTimeLocalValue(start.toISOString())
  form.value.end_at = toDateTimeLocalValue(end.toISOString())
  syncDurationFromRange()
}

const startLabel = computed(() => {
  if (!event.value) return ''
  if (event.value.all_day) {
    const [year, month, day] = String(event.value.start_at).slice(0, 10).split('-').map(Number)
    return `${year}年${month}月${day}日`
  }
  const date = new Date(event.value.start_at)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})

const save = async () => {
  if (!event.value || isSaving.value) return

  const title = form.value.title.trim()
  if (!title) {
    errorMessage.value = '填写日程标题'
    return
  }

  let start
  let end
  if (form.value.all_day) {
    if (!form.value.start_date || !form.value.end_date) {
      errorMessage.value = '填写开始和结束日期'
      return
    }
    start = toUtcMidnight(form.value.start_date)
    end = new Date(toUtcMidnight(form.value.end_date).getTime() + 86400000)
    if (end <= start) {
      errorMessage.value = '结束日期不能早于开始日期'
      return
    }
  } else {
    start = new Date(form.value.start_at)
    end = new Date(form.value.end_at)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      errorMessage.value = '填写开始和结束时间'
      return
    }
    if (end <= start) {
      errorMessage.value = '结束时间需要晚于开始时间'
      return
    }
  }

  isSaving.value = true
  const result = await scheduleStore.updateSchedule(event.value.id, {
    title,
    notes: form.value.notes.trim() || null,
    location: form.value.location.trim() || null,
    url: form.value.url.trim() || null,
    attendees: splitList(form.value.attendees),
    all_day: form.value.all_day,
    status: form.value.status,
    color: form.value.color || null,
    reminder_minutes: parseReminders(form.value.reminders),
    start_at: start.toISOString(),
    end_at: end.toISOString()
  })
  isSaving.value = false
  if (!result.success) {
    errorMessage.value = result.error || '保存日程失败'
    return
  }
  errorMessage.value = ''
  // 保存成功后收起右栏，由外层一并清掉选中
  emit('saved', result.data?.id ?? event.value.id)
  emit('close')
}

// 删除后日程已不在列表里，收起面板并让外层清掉选中项
const remove = async () => {
  if (!event.value) return
  if (!window.confirm(`删除日程「${event.value.title}」吗？`)) return

  const target = event.value
  const result = await scheduleStore.deleteSchedule(target.id)
  if (!result.success) {
    errorMessage.value = result.error || '删除日程失败'
    return
  }
  emit('event-deleted', target.id)
  emit('close')
}
</script>

<template>
  <div v-if="show" data-detail-panel :class="[
    'relative max-w-full h-full min-h-0 bg-surface dark:bg-surface-dark flex flex-col z-20 border-l border-hairline dark:border-hairline-dark'
  ]" :style="{ width: panelWidth + 'px' }">
    <!-- 左缘拖拽条与任务详情面板一致，宽度独立保存 -->
    <div
      class="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize touch-none transition-colors"
      :class="panelCollapseArmed ? 'bg-accent-700/60' : panelResizing ? 'bg-accent-500/50' : 'hover:bg-accent-500/30'"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度，继续拖动即收起"
      @pointerdown="startResize"
    ></div>

    <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">日程详情</span>
      <button type="button"
        class="p-1.5 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
        title="关闭" @click="emit('close')">
        <AppIcon name="close" :size="15" />
      </button>
    </div>

    <!-- 空状态：没有选中日程时提示从列表里点选 -->
    <div v-if="!event"
      class="flex-1 h-full flex items-center justify-center px-6 text-center text-neutral-400 dark:text-neutral-600">
      <div>
        <AppIcon name="calendar" :size="20" class="mx-auto mb-2" />
        <p class="text-sm text-neutral-500">选择一个日程查看详情</p>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-3">
      <p class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ startLabel }}</p>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">标题</span>
        <input v-model="form.title" class="field" type="text" placeholder="日程标题" />
      </label>

      <label class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
        <input v-model="form.all_day" type="checkbox" class="accent-accent-600" @change="toggleAllDay(form.all_day)" />
        <span>全天事件</span>
      </label>

      <div class="grid grid-cols-1 gap-2">
        <label v-if="form.all_day" class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">开始日期</span>
          <DateTimePicker v-model="form.start_date" mode="date" placeholder="选择日期" />
        </label>
        <label v-else class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">开始</span>
          <DateTimePicker v-model="form.start_at" placeholder="选择开始时间" @confirm="onStartConfirmed" />
        </label>
        <!-- 「时长」：改时长按开始时间算出结束；改结束时间则回填时长 -->
        <div v-if="!form.all_day" class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">时长（小时）</span>
          <input v-model="form.duration" class="field" type="number" min="0.5" step="0.5"
            placeholder="例如 1" @change="applyDurationInput" />
          <div class="mt-1.5 flex flex-wrap gap-1">
            <button v-for="preset in DURATION_PRESETS" :key="preset.hours" type="button"
              class="chip transition-colors"
              :class="Number(form.duration) === preset.hours
                ? 'border-accent-500 bg-accent-50 text-accent-800 dark:border-accent-500 dark:bg-accent-500/10 dark:text-accent-200'
                : 'hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200'"
              @click="setDuration(preset.hours)">{{ preset.label }}</button>
          </div>
        </div>
        <label v-if="form.all_day" class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">结束日期（含当天）</span>
          <DateTimePicker v-model="form.end_date" mode="date" placeholder="选择日期" />
        </label>
        <label v-else class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">结束</span>
          <DateTimePicker v-model="form.end_at" placeholder="选择结束时间" @confirm="syncDurationFromRange" />
        </label>
      </div>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">地点</span>
        <input v-model="form.location" class="field" type="text" placeholder="教室、会议室或线上地址" />
      </label>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">参与人</span>
        <input v-model="form.attendees" class="field" type="text" placeholder="姓名或邮箱，用逗号分隔" />
      </label>

      <!-- 「更多选项」：链接、状态、颜色、提醒默认收起；字段有值时自动展开 -->
      <div class="space-y-3">
        <button type="button"
          class="flex w-full items-center gap-1.5 py-0.5 text-[11px] text-neutral-500 transition-colors hover:text-accent-800 dark:text-neutral-400 dark:hover:text-accent-200"
          :aria-expanded="showMore" @click="showMore = !showMore">
          <AppIcon :name="showMore ? 'chevronDown' : 'chevronRight'" :size="12" class="opacity-70" />
          <span>更多选项</span>
        </button>

        <div v-show="showMore" class="space-y-3">
          <label class="block">
            <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">链接</span>
            <input v-model="form.url" class="field" type="url" placeholder="会议链接或相关页面" />
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">状态</span>
              <select v-model="form.status" class="field">
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">颜色</span>
              <select v-model="form.color" class="field">
                <option v-for="option in COLOR_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">提前提醒（分钟，逗号分隔）</span>
            <input v-model="form.reminders" class="field" type="text" placeholder="例如 10, 30" />
          </label>
        </div>
      </div>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">备注</span>
        <textarea v-model="form.notes" class="field resize-none" rows="5"
          placeholder="议程、注意事项或其他说明"></textarea>
      </label>

      <p v-if="errorMessage" class="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
        <AppIcon name="alert" :size="12" />
        <span>{{ errorMessage }}</span>
      </p>
    </div>

    <footer v-if="event" class="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-hairline dark:border-hairline-dark">
      <button class="btn-outline text-rose-600 dark:text-rose-400" :disabled="isSaving" @click="remove">
        <AppIcon name="trash" :size="13" />
        <span>删除</span>
      </button>
      <button class="btn-primary ml-auto" :disabled="isSaving" @click="save">
        <span>{{ isSaving ? '保存中…' : '保存' }}</span>
      </button>
    </footer>
  </div>
</template>
