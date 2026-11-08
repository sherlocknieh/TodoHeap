import ICAL from 'ical.js'

// ICS 文件上限与滴答清单导入保持一致，避免超大日历阻塞页面
export const ICS_MAX_BYTES = 5 * 1024 * 1024

// 重复日程展开窗口：只导入近期与未来一年内的实例，防止无限循环占用内存
const RECURRENCE_DAYS_BACK = 30
const RECURRENCE_DAYS_AHEAD = 365
const RECURRENCE_LIMIT = 200
const RECURRENCE_ITERATION_LIMIT = 2000

const pad = (value, length = 2) => String(value).padStart(length, '0')

// 统一输出 UTC 时间，跨时区订阅时不会因本地时区偏移
const toUtcStamp = (date) => [
  date.getUTCFullYear(),
  pad(date.getUTCMonth() + 1),
  pad(date.getUTCDate()),
  'T',
  pad(date.getUTCHours()),
  pad(date.getUTCMinutes()),
  pad(date.getUTCSeconds()),
  'Z'
].join('')

const ensureRange = (start, end, allDay) => {
  if (end && end > start) return end
  return new Date(start.getTime() + (allDay ? 86400000 : 3600000))
}

// 展开重复日程；无 RRULE 的事件按单次处理
const expandEvent = (event) => {
  if (!event.isRecurring()) {
    return [{
      start: event.startDate.toJSDate(),
      end: event.endDate?.toJSDate(),
      allDay: event.startDate.isDate
    }]
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - RECURRENCE_DAYS_BACK * 86400000)
  const windowEnd = new Date(now.getTime() + RECURRENCE_DAYS_AHEAD * 86400000)
  const baseStart = event.startDate.toJSDate()
  const duration = Math.max(ensureRange(baseStart, event.endDate?.toJSDate(), event.startDate.isDate).getTime() - baseStart.getTime(), 0)

  const occurrences = []
  const iterator = event.iterator()
  for (let i = 0; i < RECURRENCE_ITERATION_LIMIT && occurrences.length < RECURRENCE_LIMIT; i += 1) {
    const next = iterator.next()
    if (!next) break
    const start = next.toJSDate()
    if (start > windowEnd) break
    if (start < windowStart) continue
    occurrences.push({ start, end: new Date(start.getTime() + duration), allDay: next.isDate })
  }
  return occurrences
}

// 解析 ICS 文本，返回可直接写入 schedules 的事件列表
export const parseIcsEvents = (text) => {
  const root = new ICAL.Component(ICAL.parse(text))
  const components = root.getAllSubcomponents('vevent')
  const events = []
  let skipped = 0

  components.forEach((component) => {
    const event = new ICAL.Event(component)
    if (!event.startDate) {
      skipped += 1
      return
    }

    expandEvent(event).forEach((occurrence) => {
      const { start, allDay } = occurrence
      const end = ensureRange(start, occurrence.end, allDay)
      events.push({
        title: (event.summary || '未命名日程').trim(),
        notes: event.description ? String(event.description).trim() : null,
        start_at: start.toISOString(),
        end_at: end.toISOString()
      })
    })
  })

  return {
    events: events.sort((a, b) => a.start_at.localeCompare(b.start_at)),
    skipped
  }
}

const escapeText = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')

// 按 RFC 5545 的 75 字节限制折行，中文按 UTF-8 字节计算
const foldLine = (line) => {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const chunks = []
  let current = ''
  let currentBytes = 0
  for (const char of line) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > 74) {
      chunks.push(current)
      current = ''
      currentBytes = 0
    }
    current += char
    currentBytes += charBytes
  }
  chunks.push(current)
  return chunks.join('\r\n ')
}

// 生成供下载或订阅使用的日历文本
export const buildIcs = (schedules, { calendarName = 'TodoHeap 日程' } = {}) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TodoHeap//Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:UTC'
  ]

  const stamp = toUtcStamp(new Date())
  for (const schedule of schedules) {
    const start = new Date(schedule.start_at)
    const end = ensureRange(start, new Date(schedule.end_at), false)
    lines.push(
      'BEGIN:VEVENT',
      `UID:todoheap-${schedule.id}@todoheap`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toUtcStamp(start)}`,
      `DTEND:${toUtcStamp(end)}`,
      `SUMMARY:${escapeText(schedule.title || '未命名日程')}`
    )
    if (schedule.notes) {
      lines.push(`DESCRIPTION:${escapeText(schedule.notes)}`)
    }
    if (schedule.updated_at) {
      lines.push(`LAST-MODIFIED:${toUtcStamp(new Date(schedule.updated_at))}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

// 触发浏览器下载，文件名带日期便于区分多次导出
export const downloadIcs = (content, filename = `todoheap-${new Date().toISOString().slice(0, 10)}.ics`) => {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
