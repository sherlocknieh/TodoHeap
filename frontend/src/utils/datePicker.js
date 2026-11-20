// 自建时间选择器的纯计算：月历网格、local 字符串互转、时分限幅
// 被 components/DateTimePicker.vue 依赖；字符串格式与 utils/deadline.js 的 toDateTimeLocalValue 一致

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

// 2 位补零，拼接 datetime-local / date 字符串时统一用
const pad = (num) => String(num).padStart(2, '0')

// 'YYYY-MM-DD' 与 'YYYY-MM-DDTHH:mm' 一律按本地时间解析；空值与非法值返回 null
export const parseLocalValue = (value) => {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value))
  if (!match) return null
  const [, year, month, day, hour = '0', minute = '0'] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  return Number.isNaN(date.getTime()) ? null : date
}

// 日期转 'YYYY-MM-DD'
export const toDateValue = (date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 日期转 'YYYY-MM-DDTHH:mm'，与原生 datetime-local 的取值格式一致
export const toDateTimeValue = (date) => {
  return `${toDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 月历固定 6 行 42 天、周一起始；inMonth 决定跨月日期是否淡显，isToday 用于描边
export const buildMonthGrid = (year, month, today = new Date()) => {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const todayKey = toDateValue(today)
  const days = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, 1 - offset + index)
    const key = toDateValue(date)
    days.push({
      date,
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === todayKey
    })
  }
  return days
}

// 月份加减，跨年自动折算；返回 { year, month }（month 为 0 基）
export const shiftMonth = (year, month, delta) => {
  const date = new Date(year, month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

// 小时限制在 0–23，分钟限制在 0–59；空输入按 0 处理
export const clampHour = (value) => Math.min(23, Math.max(0, Number(value) || 0))

export const clampMinute = (value) => Math.min(59, Math.max(0, Number(value) || 0))

// 触发器上的展示文案：同年只写月日，跨年补年份；日期模式始终带年份
export const formatPickerLabel = (value, mode = 'datetime') => {
  const date = parseLocalValue(value)
  if (!date) return ''
  if (mode === 'date') return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  const now = new Date()
  const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
