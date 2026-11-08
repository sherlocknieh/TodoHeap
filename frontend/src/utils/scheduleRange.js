// 日程时间段与日期键：侧栏统计、日期翻页与月历共用同一套判定
export const SCHEDULE_RANGES = ['today', 'future', 'past']

const pad = (num) => String(num).padStart(2, '0')

// 本地日期键，避免跨时区把同一自然日拆开
export const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 解析 YYYY-MM-DD；非法输入交给调用方回退到今天
export const parseDateKey = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

// 以自然日划分：与今天有重叠的跨天事件算今天，结束于今天零点之前算已过去
export const scheduleRangeOf = (event, now = new Date()) => {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  if (end <= startOfToday) return 'past'
  if (start > endOfToday) return 'future'
  return 'today'
}
