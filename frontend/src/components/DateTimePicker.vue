<!--
  自建日期时间选择器，替代原生 datetime-local / date。
  被 TodoListItem 与 TodoList 的截止时间下拉、TodoDetailEditor、ScheduleDetailPanel 依赖；
  v-model 使用本地 'YYYY-MM-DDTHH:mm'（mode=datetime）或 'YYYY-MM-DD'（mode=date），
  与 utils/deadline.js 的 toDateTimeLocalValue 同格式，提交时由父组件转 ISO。
-->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  clampHour,
  clampMinute,
  formatPickerLabel,
  parseLocalValue,
  shiftMonth,
  toDateValue,
  toDateTimeValue
} from '@/utils/datePicker'

const props = defineProps({
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'datetime' }, // datetime | date
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
  // 截止时间入口把今天/明天/一周后收进面板，不再需要上级菜单
  quickDates: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// 常用时间点，省去逐位输入；23:59 是空值默认时分，不重复列出
const TIME_PRESETS = ['09:00', '12:00', '18:00']

// 面板内的日期快捷项，只给截止时间入口启用
const QUICK_DATES = [
  { label: '今天', offset: 0 },
  { label: '明天', offset: 1 },
  { label: '一周后', offset: 7 }
]

const open = ref(false)
const panelReady = ref(false)
const rootEl = ref(null)
const panelEl = ref(null)
const position = ref({ top: 0, left: 0 })

const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())
const draftDate = ref(null)
const draftHour = ref(23)
const draftMinute = ref(59)

const isDateTime = computed(() => props.mode !== 'date')
const displayText = computed(() => formatPickerLabel(props.modelValue, props.mode))
const placeholderText = computed(() => props.placeholder || (isDateTime.value ? '选择日期时间' : '选择日期'))
const monthLabel = computed(() => `${viewYear.value}年${viewMonth.value + 1}月`)
const days = computed(() => buildMonthGrid(viewYear.value, viewMonth.value))
const selectedKey = computed(() => (draftDate.value ? toDateValue(draftDate.value) : ''))
const draftValue = computed(() => {
  if (!draftDate.value) return ''
  if (!isDateTime.value) return toDateValue(draftDate.value)
  const date = new Date(draftDate.value)
  date.setHours(clampHour(draftHour.value), clampMinute(draftMinute.value), 0, 0)
  return toDateTimeValue(date)
})

// 从当前值（或今天）生成草稿；时分沿用原值，空值默认 23:59
const initDraft = () => {
  const parsed = parseLocalValue(props.modelValue)
  const base = parsed || new Date()
  draftDate.value = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  draftHour.value = parsed ? parsed.getHours() : 23
  draftMinute.value = parsed ? parsed.getMinutes() : 59
  viewYear.value = draftDate.value.getFullYear()
  viewMonth.value = draftDate.value.getMonth()
}

// 面板水平居中对齐触发器，空间不足时夹进视口；垂直方向放不下就翻到上方
const updatePosition = () => {
  if (!open.value || !rootEl.value || !panelEl.value) return
  const triggerRect = rootEl.value.getBoundingClientRect()
  const panelRect = panelEl.value.getBoundingClientRect()
  const margin = 8
  let top = triggerRect.bottom + 4
  if (top + panelRect.height > window.innerHeight - margin) {
    top = Math.max(margin, triggerRect.top - panelRect.height - 4)
  }
  const centered = triggerRect.left + triggerRect.width / 2 - panelRect.width / 2
  const left = Math.min(Math.max(margin, centered), window.innerWidth - panelRect.width - margin)
  position.value = { top, left }
}

const openPicker = async () => {
  if (props.disabled) return
  initDraft()
  open.value = true
  panelReady.value = false
  await nextTick()
  updatePosition()
  panelReady.value = true
  await nextTick()
  panelEl.value?.focus()
}

const closePicker = () => {
  if (!open.value) return
  open.value = false
  rootEl.value?.querySelector('button')?.focus()
}

const togglePicker = () => {
  if (open.value) closePicker()
  else openPicker()
}

// 确定：把草稿写回 v-model，父组件可在 confirm 里落库或收起自己的菜单
const confirm = () => {
  const value = draftValue.value
  if (!value) return closePicker()
  emit('update:modelValue', value)
  emit('confirm', value)
  closePicker()
}

const clearValue = () => {
  emit('update:modelValue', '')
  emit('confirm', '')
  closePicker()
}

// 选中日期；点到跨月日期时把视图切到该月
const selectDay = (day) => {
  draftDate.value = new Date(day.date)
  if (day.date.getMonth() !== viewMonth.value) {
    viewYear.value = day.date.getFullYear()
    viewMonth.value = day.date.getMonth()
  }
}

const shiftView = (delta) => {
  const next = shiftMonth(viewYear.value, viewMonth.value, delta)
  viewYear.value = next.year
  viewMonth.value = next.month
}

const goToday = () => {
  selectQuickDate(0)
}

// 快捷日期只改草稿，日期与时分一起由「确定」写回
const selectQuickDate = (offset) => {
  const base = new Date()
  base.setDate(base.getDate() + offset)
  draftDate.value = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  viewYear.value = base.getFullYear()
  viewMonth.value = base.getMonth()
}

// 在月历上滚动滚轮翻月；累计到一定幅度才翻，并加冷却，避免触控板惯性强连翻
let wheelDelta = 0
let wheelAt = 0
const onGridWheel = (event) => {
  if (!event.deltaY) return
  const now = Date.now()
  if (now - wheelAt < 180) return
  wheelDelta += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
  if (Math.abs(wheelDelta) < 40) return
  shiftView(wheelDelta > 0 ? 1 : -1)
  wheelDelta = 0
  wheelAt = now
}

const setHour = (event) => {
  draftHour.value = clampHour(event.target.value)
}

const setMinute = (event) => {
  draftMinute.value = clampMinute(event.target.value)
}

// 加减器按周期循环：23 点加一小时回到 0 点，59 分加一分回到 0 分
const stepHour = (delta) => {
  draftHour.value = (clampHour(draftHour.value) + delta + 24) % 24
}

const stepMinute = (delta) => {
  draftMinute.value = (clampMinute(draftMinute.value) + delta + 60) % 60
}

const applyTime = (time) => {
  const [hour, minute] = time.split(':').map(Number)
  draftHour.value = hour
  draftMinute.value = minute
}

// 方向键逐日/逐周移动草稿，PgUp/PgDn 翻月，Enter 确定，Esc 关闭
const moveDraft = (deltaDays) => {
  if (!draftDate.value) return
  const next = new Date(draftDate.value)
  next.setDate(next.getDate() + deltaDays)
  draftDate.value = next
  if (next.getMonth() !== viewMonth.value) {
    viewYear.value = next.getFullYear()
    viewMonth.value = next.getMonth()
  }
}

const onPanelKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePicker()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    confirm()
    return
  }
  // 时分输入框里的方向键留给输入框自己
  if (event.target?.tagName === 'INPUT') return
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    shiftView(event.key === 'PageUp' ? -1 : 1)
    return
  }
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
  if (delta == null) return
  event.preventDefault()
  moveDraft(delta)
}

const dayClass = (day) => {
  if (day.key === selectedKey.value) {
    return 'bg-accent-700 font-medium text-white hover:bg-accent-800 dark:bg-accent-400 dark:text-accent-950 dark:hover:bg-accent-300'
  }
  if (day.isToday) {
    return 'border border-accent-400 text-accent-800 hover:bg-accent-50 dark:text-accent-200 dark:hover:bg-accent-500/10'
  }
  if (!day.inMonth) {
    return 'text-neutral-300 hover:bg-neutral-100 dark:text-neutral-600 dark:hover:bg-neutral-800'
  }
  return 'text-neutral-700 hover:bg-accent-50 dark:text-neutral-200 dark:hover:bg-accent-500/10'
}

// 点面板外收起；面板经 Teleport 挂在 body 上，需同时判断触发器与面板
const onDocumentPointerDown = (event) => {
  if (!open.value) return
  if (rootEl.value?.contains(event.target) || panelEl.value?.contains(event.target)) return
  open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', updatePosition)
  document.addEventListener('scroll', updatePosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', updatePosition)
  document.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div ref="rootEl" class="relative">
    <!-- 「时间选择器触发器」：默认外观与 .field 一致；截止时间入口用 slot 换成日历按钮/截止标签 -->
    <slot name="trigger" :open="open" :toggle="togglePicker">
      <button type="button" :disabled="disabled" :aria-expanded="open" aria-haspopup="dialog"
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-input-border bg-input px-3 py-1.5 text-left text-sm outline-none transition-colors hover:border-accent-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-input-border-dark dark:bg-input-dark dark:hover:border-accent-500/40"
        @click.stop="togglePicker">
        <span class="min-w-0 truncate"
          :class="displayText ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'">
          {{ displayText || placeholderText }}
        </span>
        <AppIcon name="calendar" :size="14" class="shrink-0 text-neutral-400" />
      </button>
    </slot>

    <Teleport to="body">
      <div v-if="open" ref="panelEl" tabindex="-1" role="dialog" aria-label="选择日期时间"
        class="date-picker-panel panel fixed z-50 w-72 p-3 outline-none"
        :style="{ top: `${position.top}px`, left: `${position.left}px`, visibility: panelReady ? 'visible' : 'hidden' }"
        @keydown="onPanelKeydown">
        <!-- 月份切换：标题居中，今天跳回当月 -->
        <div class="flex items-center gap-1">
          <button type="button"
            class="grid h-6 w-6 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            title="上个月" aria-label="上个月" @click="shiftView(-1)">
            <AppIcon name="chevronLeft" :size="14" />
          </button>
          <span class="flex-1 text-center text-xs font-semibold text-neutral-700 dark:text-neutral-200">{{ monthLabel }}</span>
          <button type="button"
            class="grid h-6 w-6 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            title="下个月" aria-label="下个月" @click="shiftView(1)">
            <AppIcon name="chevronRight" :size="14" />
          </button>
          <button v-if="!quickDates" type="button"
            class="ml-1 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-500 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            @click="goToday">今天</button>
        </div>

        <!-- 日期快捷项：截止时间入口用，点选只改草稿 -->
        <div v-if="quickDates" class="mt-1.5 flex gap-1">
          <button v-for="item in QUICK_DATES" :key="item.label" type="button"
            class="flex-1 rounded-md border border-hairline py-1 text-[11px] text-neutral-500 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 dark:border-hairline-dark dark:text-neutral-400 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            @click="selectQuickDate(item.offset)">{{ item.label }}</button>
        </div>

        <!-- 星期表头 + 日期网格（周一起始，固定 6 行；滚轮翻月） -->
        <div class="mt-2 grid grid-cols-7 gap-0.5 text-center" @wheel.prevent="onGridWheel">
          <span v-for="label in WEEKDAY_LABELS" :key="label"
            class="py-1 text-[10px] text-neutral-400 dark:text-neutral-500">{{ label }}</span>
          <button v-for="day in days" :key="day.key" type="button"
            class="grid h-7 place-items-center rounded-md text-xs transition-colors" :class="dayClass(day)"
            @click="selectDay(day)">{{ day.day }}</button>
        </div>

        <!-- 时分：仅日期时间模式；备选时间在上，输入器与清除/确定同一行 -->
        <div v-if="isDateTime" class="mt-2.5 border-t border-hairline pt-2.5 dark:border-hairline-dark">
          <div class="flex gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <button v-for="time in TIME_PRESETS" :key="time" type="button"
              class="flex-1 rounded-md border border-hairline py-1 text-[11px] text-neutral-500 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 dark:border-hairline-dark dark:text-neutral-400 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
              @click="applyTime(time)">{{ time }}</button>
          </div>
          <div class="mt-1.5 flex items-center gap-1.5">
            <AppIcon name="clock" :size="12" class="shrink-0 text-neutral-500 dark:text-neutral-400" />
            <div
              class="flex items-center rounded-md border border-input-border bg-input dark:border-input-border-dark dark:bg-input-dark">
              <button type="button"
                class="grid h-7 w-5 place-items-center text-neutral-400 transition-colors hover:text-accent-800 dark:text-neutral-500 dark:hover:text-accent-200"
                title="减一小时" aria-label="减一小时" @click="stepHour(-1)">
                <AppIcon name="minus" :size="9" />
              </button>
              <input :value="draftHour" type="text" inputmode="numeric" maxlength="2" aria-label="小时"
                class="h-7 w-6 bg-transparent text-center text-xs text-neutral-800 outline-none dark:text-neutral-100"
                @input="setHour" @keydown.up.prevent="stepHour(1)" @keydown.down.prevent="stepHour(-1)" />
              <button type="button"
                class="grid h-7 w-5 place-items-center text-neutral-400 transition-colors hover:text-accent-800 dark:text-neutral-500 dark:hover:text-accent-200"
                title="加一小时" aria-label="加一小时" @click="stepHour(1)">
                <AppIcon name="plus" :size="9" />
              </button>
            </div>
            <span class="text-xs text-neutral-400">:</span>
            <div
              class="flex items-center rounded-md border border-input-border bg-input dark:border-input-border-dark dark:bg-input-dark">
              <button type="button"
                class="grid h-7 w-5 place-items-center text-neutral-400 transition-colors hover:text-accent-800 dark:text-neutral-500 dark:hover:text-accent-200"
                title="减一分钟" aria-label="减一分钟" @click="stepMinute(-1)">
                <AppIcon name="minus" :size="9" />
              </button>
              <input :value="draftMinute" type="text" inputmode="numeric" maxlength="2" aria-label="分钟"
                class="h-7 w-6 bg-transparent text-center text-xs text-neutral-800 outline-none dark:text-neutral-100"
                @input="setMinute" @keydown.up.prevent="stepMinute(1)" @keydown.down.prevent="stepMinute(-1)" />
              <button type="button"
                class="grid h-7 w-5 place-items-center text-neutral-400 transition-colors hover:text-accent-800 dark:text-neutral-500 dark:hover:text-accent-200"
                title="加一分钟" aria-label="加一分钟" @click="stepMinute(1)">
                <AppIcon name="plus" :size="9" />
              </button>
            </div>
            <div class="ml-auto flex items-center gap-1">
              <button v-if="clearable && modelValue" type="button" class="btn-ghost h-7 px-2 text-xs"
                @click="clearValue">清除</button>
              <button type="button" class="btn-primary h-7 px-3 text-xs" @click="confirm">确定</button>
            </div>
          </div>
        </div>

        <!-- 仅日期模式没有时间行，操作单独占一行 -->
        <div v-else class="mt-2.5 flex items-center gap-1.5 border-t border-hairline pt-2.5 dark:border-hairline-dark">
          <button v-if="clearable && modelValue" type="button" class="btn-ghost h-7 px-2 text-xs"
            @click="clearValue">清除</button>
          <button type="button" class="btn-primary ml-auto h-7 px-3 text-xs" @click="confirm">确定</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
