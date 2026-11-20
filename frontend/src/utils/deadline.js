// 时间值转选择器与原生 datetime-local 共用的本地格式
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

// 截止标签按剩余天数分级着色：逾期红、3 天内橙、7 天内黄、更远中性，与任务图紧急度同色系
export const deadlineChipClass = (value, now = new Date()) => {
  if (!value) return ''
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return ''

  if (due < now) {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:border-rose-500/50'
  }

  const days = calendarDaysUntil(value, now)
  if (days <= 3) {
    return 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-500/50'
  }
  if (days <= 7) {
    return 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:border-yellow-300 dark:border-yellow-500/30 dark:bg-yellow-950/40 dark:text-yellow-300 dark:hover:border-yellow-500/50'
  }
  return 'border-hairline text-neutral-500 hover:border-accent-300 hover:text-neutral-700 dark:border-hairline-dark dark:text-neutral-400 dark:hover:border-accent-500/40 dark:hover:text-neutral-200'
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

// 节点右区的简短倒数：逾期/今天/明天/N天，只用于一周内的紧急任务
export const formatDeadlineShort = (value, now = new Date()) => {
  const days = calendarDaysUntil(value, now)
  if (days == null) return ''
  if (days < 0) return '逾期'
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  return `${days}天`
}
