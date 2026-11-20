// 截止时间快捷预设：行内设置与批量设置共用同一套换算规则
export const DEADLINE_PRESETS = [
  { value: 'today', label: '今天', icon: 'clock' },
  { value: 'tomorrow', label: '明天', icon: 'calendar' },
  { value: 'weekend', label: '本周末', icon: 'calendar' }
]

// 截止时间落到当天结束，符合「今天做完」的直觉
const endOfDay = (date) => {
  const result = new Date(date)
  result.setHours(23, 59, 0, 0)
  return result
}

// 把预设换算成 ISO 时间；clear 与未知预设返回 null
export const resolveDeadlinePreset = (preset) => {
  const now = new Date()
  if (preset === 'today') return endOfDay(now).toISOString()
  if (preset === 'tomorrow') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return endOfDay(tomorrow).toISOString()
  }
  if (preset === 'weekend') {
    const sunday = new Date(now)
    sunday.setDate(sunday.getDate() + ((7 - now.getDay()) % 7))
    return endOfDay(sunday).toISOString()
  }
  return null
}

// 时间值转 datetime-local 输入框需要的格式
export const toDateTimeLocalValue = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 截止时间的口语化标签：最近一周说「x 天后」，更远只给月日；任务行与添加栏共用
export const formatDeadlineLabel = (value) => {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  if (diffDays > 0 && diffDays <= 7) return `${diffDays}天后`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}天前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 截止标签按到期状态着色：逾期红、今天绿、以后中性，扫清单时最急的先跳出来
export const deadlineChipClass = (value) => {
  if (!value) return ''
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return ''

  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (due < now) {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:border-rose-500/50'
  }
  if (due <= endOfToday) {
    return 'border-accent-200 bg-accent-50 text-accent-800 hover:border-accent-300 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200 dark:hover:border-accent-500/50'
  }
  return 'border-hairline text-neutral-500 hover:border-accent-300 hover:text-neutral-700 dark:border-hairline-dark dark:text-neutral-400 dark:hover:border-accent-500/40 dark:hover:text-neutral-200'
}

// 截止时间到本地自然日的剩余天数，逾期为负；无值或非法日期返回 null
const calendarDaysUntil = (value, now) => {
  if (!value) return null
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

// 任务图紧急圆点的分级：一天内 critical、三天内 urgent、一周内 soon；
// 逾期同样算 critical，一周以外与无截止日期返回 null（画布上不显示提示）
export const deadlineUrgency = (value, now = new Date()) => {
  const days = calendarDaysUntil(value, now)
  if (days == null) return null
  if (days <= 1) return 'critical'
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'soon'
  return null
}

// 紧急圆点浮层里的截止时间：月日 + 时分，例如「11月21日 23:59」
export const formatDeadlineDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 紧急圆点浮层里的倒数日：逾期/今天/明天/还剩 N 天
export const deadlineCountdown = (value, now = new Date()) => {
  const days = calendarDaysUntil(value, now)
  if (days == null) return ''
  if (days < 0) return `已逾期 ${-days} 天`
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  return `还剩 ${days} 天`
}
