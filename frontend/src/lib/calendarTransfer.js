import { buildIcs, downloadIcs, ICS_MAX_BYTES, parseIcsEvents } from './ics'
import { fetchUserSettings, saveUserSettings } from './userSettings'

// 令牌操作前先读最新设置，避免用过期表单覆盖其他设备的偏好
const loadLatestSettings = async (userId, fallback) => {
  const result = await fetchUserSettings(userId)
  return result.success ? { ...fallback, ...result.data } : fallback
}

// 生成不可猜测的订阅令牌：128 位随机数，URL 泄露等同于只读凭据
const createToken = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// 读取用户上传的 ICS：先校验大小，再解析成可写入的日程
export const readIcsFile = async (file) => {
  if (!file) throw new Error('未选择文件')
  if (file.size > ICS_MAX_BYTES) throw new Error('文件超过 5 MB，请先在日历软件中分批导出')

  const text = await file.text()
  if (!text.trim()) throw new Error('文件为空')
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('不是有效的 ICS 日历文件')

  const { events, skipped } = parseIcsEvents(text)
  if (!events.length) throw new Error('没有找到可导入的日程')
  return { events, skipped }
}

// 导出当前全部日程为 ICS 文件
export const exportSchedulesIcs = (schedules, filename) => {
  if (!schedules.length) throw new Error('暂无可导出的日程')
  downloadIcs(buildIcs(schedules), filename)
  return schedules.length
}

export const buildCalendarFeedUrl = (token) => {
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  return `${base}/functions/v1/calendar_feed?token=${encodeURIComponent(token)}`
}

// 首次生成订阅令牌；已有令牌时原样返回，避免重复写库
export const ensureCalendarFeedToken = async (userId, settings) => {
  const latest = await loadLatestSettings(userId, settings || {})
  if (latest.calendarFeedToken) {
    return { success: true, token: latest.calendarFeedToken, settings: latest }
  }
  const token = createToken()
  const result = await saveUserSettings(userId, { ...latest, calendarFeedToken: token })
  if (!result.success) return { success: false, error: result.error }
  return { success: true, token, settings: result.data }
}

// 重新生成令牌会让旧订阅链接立即失效
export const rotateCalendarFeedToken = async (userId, settings) => {
  const latest = await loadLatestSettings(userId, settings || {})
  const token = createToken()
  const result = await saveUserSettings(userId, { ...latest, calendarFeedToken: token })
  if (!result.success) return { success: false, error: result.error }
  return { success: true, token, settings: result.data }
}

// 停用订阅：删除令牌后日历软件再次拉取会收到 404
export const disableCalendarFeed = async (userId, settings) => {
  const latest = await loadLatestSettings(userId, settings || {})
  const { calendarFeedToken: _removed, ...rest } = latest
  const result = await saveUserSettings(userId, rest)
  if (!result.success) return { success: false, error: result.error }
  return { success: true, settings: result.data }
}
