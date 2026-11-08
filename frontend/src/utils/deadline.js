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
