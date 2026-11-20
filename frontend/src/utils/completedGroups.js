// 任务按天分组：任务表「已完成」区与回收站共用。
// 日期键与标题按本地自然日；已完成区再按 completed_at 分组、组内按完成时间倒序。

const pad = (num) => String(num).padStart(2, '0')

// 本地自然日的稳定键，避免用 UTC 日期把深夜操作的任务分到前一天
export const dayKeyOf = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 日期标题：今天、昨天之外的日期只给月日，跨年时补上年份
export const formatDayLabel = (key, now = new Date()) => {
  if (!key) return ''
  const todayKey = dayKeyOf(now)
  if (key === todayKey) return '今天'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === dayKeyOf(yesterday)) return '昨天'

  const [year, month, day] = key.split('-').map(Number)
  if (year !== now.getFullYear()) return `${year}年${month}月${day}日`
  return `${month}月${day}日`
}

// 完成时间：已完成区按天分组，行内只显示本地时分
export const formatCompletionTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 输出按完成日期倒序的分组，组内任务同样按完成时间倒序
export const groupCompletedByDay = (todos, now = new Date()) => {
  const groups = new Map()

  for (const todo of todos || []) {
    const key = dayKeyOf(todo?.completed_at)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(todo)
  }

  const byCompletedAtDesc = (a, b) => {
    const aTime = new Date(a.completed_at).getTime()
    const bTime = new Date(b.completed_at).getTime()
    return bTime - aTime
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      key,
      label: formatDayLabel(key, now),
      count: items.length,
      todos: items.slice().sort(byCompletedAtDesc)
    }))
}
