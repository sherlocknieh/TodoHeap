import ICAL from 'ical.js'

// ICS 文件上限与滴答清单导入保持一致，避免超大日历阻塞页面
export const ICS_MAX_BYTES = 5 * 1024 * 1024

// 重复日程展开窗口：只导入近期与未来一年内的实例，防止无限循环占用内存
const RECURRENCE_DAYS_BACK = 30
const RECURRENCE_DAYS_AHEAD = 365
const RECURRENCE_LIMIT = 200
const RECURRENCE_ITERATION_LIMIT = 2000

const SCHEDULE_STATUSES = ['confirmed', 'tentative', 'cancelled']
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

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

// 全天事件用 UTC 日期表达，避免 DATE 值被时区换算到前一天
const toDateStamp = (date) => [
  date.getUTCFullYear(),
  pad(date.getUTCMonth() + 1),
  pad(date.getUTCDate())
].join('')

const utcDateKey = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

// DATE 型取值按 UTC 零点还原，定时事件保留真实瞬间
const timeToDate = (time) => (time.isDate
  ? new Date(Date.UTC(time.year, time.month - 1, time.day))
  : time.toJSDate())

const ensureRange = (start, end, allDay) => {
  if (end && end > start) return end
  return new Date(start.getTime() + (allDay ? 86400000 : 3600000))
}

// 展开重复日程；无 RRULE 的事件按单次处理
const expandEvent = (event) => {
  if (!event.isRecurring()) {
    return [{
      start: timeToDate(event.startDate),
      end: event.endDate ? timeToDate(event.endDate) : null,
      allDay: event.startDate.isDate
    }]
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - RECURRENCE_DAYS_BACK * 86400000)
  const windowEnd = new Date(now.getTime() + RECURRENCE_DAYS_AHEAD * 86400000)
  const baseStart = timeToDate(event.startDate)
  const duration = Math.max(ensureRange(baseStart, event.endDate ? timeToDate(event.endDate) : null, event.startDate.isDate).getTime() - baseStart.getTime(), 0)

  const occurrences = []
  const iterator = event.iterator()
  for (let i = 0; i < RECURRENCE_ITERATION_LIMIT && occurrences.length < RECURRENCE_LIMIT; i += 1) {
    const next = iterator.next()
    if (!next) break
    const start = timeToDate(next)
    if (start > windowEnd) break
    if (start < windowStart) continue
    occurrences.push({ start, end: new Date(start.getTime() + duration), allDay: next.isDate })
  }
  return occurrences
}

// ATTENDEE 优先取 CN(显示名)，没有时退回 mailto 地址
const readAttendees = (component) => [...new Set(component.getAllProperties('attendee')
  .map((property) => {
    const name = property.getParameter('cn')
    if (name) return String(name).trim()
    return String(property.getFirstValue() ?? '').replace(/^mailto:/i, '').trim()
  })
  .filter(Boolean))]

// VALARM 的 TRIGGER 换算成开始前分钟数；不支持相对时间的绝对触发器
const readReminderMinutes = (component) => {
  const minutes = []
  for (const alarm of component.getAllSubcomponents('valarm')) {
    if (String(alarm.getFirstPropertyValue('action') || '').toUpperCase() !== 'DISPLAY') continue
    const trigger = alarm.getFirstPropertyValue('trigger')
    let seconds = 0
    if (trigger instanceof ICAL.Duration) {
      seconds = trigger.toSeconds()
    } else if (typeof trigger === 'string') {
      try {
        seconds = ICAL.Duration.fromString(trigger).toSeconds()
      } catch {
        seconds = 0
      }
    }
    if (!seconds) continue
    minutes.push(Math.max(0, Math.round(Math.abs(seconds) / 60)))
  }
  return [...new Set(minutes)].sort((a, b) => a - b)
}

const readStatus = (component) => {
  const status = String(component.getFirstPropertyValue('status') || '').toLowerCase()
  return SCHEDULE_STATUSES.includes(status) ? status : 'confirmed'
}

const readColor = (component) => {
  const color = String(component.getFirstPropertyValue('color') || '').trim()
  return HEX_COLOR.test(color) ? color : null
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

    const uid = String(component.getFirstPropertyValue('uid') || '').trim()
    const location = String(component.getFirstPropertyValue('location') || '').trim() || null
    const url = String(component.getFirstPropertyValue('url') || '').trim() || null
    const attendees = readAttendees(component)
    const reminderMinutes = readReminderMinutes(component)
    const status = readStatus(component)
    const color = readColor(component)

    expandEvent(event).forEach((occurrence) => {
      const { start, allDay } = occurrence
      const end = ensureRange(start, occurrence.end, allDay)
      events.push({
        title: (event.summary || '未命名日程').trim(),
        notes: event.description ? String(event.description).trim() : null,
        location,
        url,
        attendees,
        all_day: allDay,
        status,
        color,
        reminder_minutes: reminderMinutes,
        external_id: uid ? `ics:${uid}:${allDay ? utcDateKey(start) : start.toISOString()}` : null,
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

// 参数值用双引号包裹，避免姓名中的逗号被当成多个参数
const escapeParam = (value) => `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

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
    const end = ensureRange(start, new Date(schedule.end_at), Boolean(schedule.all_day))

    lines.push('BEGIN:VEVENT', `UID:todoheap-${schedule.id}@todoheap`, `DTSTAMP:${stamp}`)
    if (schedule.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${toDateStamp(start)}`, `DTEND;VALUE=DATE:${toDateStamp(end)}`)
    } else {
      lines.push(`DTSTART:${toUtcStamp(start)}`, `DTEND:${toUtcStamp(end)}`)
    }
    lines.push(`SUMMARY:${escapeText(schedule.title || '未命名日程')}`)

    if (schedule.notes) lines.push(`DESCRIPTION:${escapeText(schedule.notes)}`)
    if (schedule.location) lines.push(`LOCATION:${escapeText(schedule.location)}`)
    if (schedule.url) lines.push(`URL:${escapeText(schedule.url)}`)
    if (schedule.status) lines.push(`STATUS:${String(schedule.status).toUpperCase()}`)
    if (schedule.color && HEX_COLOR.test(schedule.color)) lines.push(`COLOR:${schedule.color}`)

    ;(schedule.attendees || []).forEach((name, index) => {
      // 只有姓名时用稳定的 URN 作为地址，CN 保留显示名
      lines.push(`ATTENDEE;CN=${escapeParam(name)};ROLE=REQ-PARTICIPANT:urn:todoheap:attendee:${schedule.id}:${index}`)
    })
    if (schedule.updated_at) {
      lines.push(`LAST-MODIFIED:${toUtcStamp(new Date(schedule.updated_at))}`)
    }

    for (const minutes of schedule.reminder_minutes || []) {
      if (!Number.isInteger(minutes) || minutes < 0) continue
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(schedule.title || '日程提醒')}`,
        `TRIGGER:-PT${minutes}M`,
        'END:VALARM'
      )
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
