// 日程时间段：侧栏统计与列表筛选共用同一条判定，避免两处口径漂移
export const SCHEDULE_RANGES = ['today', 'future', 'past']

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
