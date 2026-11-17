import { describe, it, expect } from 'vitest'
import { parseIcsEvents, buildIcs } from './ics'

const wrap = (body) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n')

describe('parseIcsEvents', () => {
  it('读取单次日程并转成 UTC 时间', () => {
    const text = wrap([
      'BEGIN:VEVENT',
      'UID:a',
      'SUMMARY:写周报',
      'DESCRIPTION:第一行\\n第二行',
      'DTSTART:20261108T010000Z',
      'DTEND:20261108T020000Z',
      'END:VEVENT'
    ])

    const { events, skipped } = parseIcsEvents(text)

    expect(skipped).toBe(0)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      title: '写周报',
      notes: '第一行\n第二行',
      start_at: '2026-11-08T01:00:00.000Z',
      end_at: '2026-11-08T02:00:00.000Z'
    })
  })

  it('缺少结束时间时补足一小时，全日事件补足一天', () => {
    const text = wrap([
      'BEGIN:VEVENT',
      'UID:timed',
      'SUMMARY:开会',
      'DTSTART:20261108T010000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:allday',
      'SUMMARY:纪念日',
      'DTSTART;VALUE=DATE:20261108',
      'END:VEVENT'
    ])

    const { events } = parseIcsEvents(text)

    const meeting = events.find((event) => event.title === '开会')
    const anniversary = events.find((event) => event.title === '纪念日')

    expect(meeting.end_at).toBe('2026-11-08T02:00:00.000Z')
    expect(new Date(anniversary.end_at).getTime() - new Date(anniversary.start_at).getTime()).toBe(86400000)
  })

  it('忽略没有开始时间的事件', () => {
    const text = wrap([
      'BEGIN:VEVENT',
      'UID:broken',
      'SUMMARY:缺失时间',
      'END:VEVENT'
    ])

    const { events, skipped } = parseIcsEvents(text)

    expect(events).toHaveLength(0)
    expect(skipped).toBe(1)
  })

  it('拆出地点、链接、参与人、状态、颜色与提醒', () => {
    const text = wrap([
      'BEGIN:VEVENT',
      'UID:course-1',
      'SUMMARY:英美大众文化',
      'DESCRIPTION:第3 - 4节',
      'LOCATION:坤銮楼（2号楼）C202',
      'URL:https://example.com/meet',
      'ATTENDEE;CN="齐洁":mailto:qijie@example.com',
      'ATTENDEE;CN="李杰":mailto:lijie@example.com',
      'STATUS:TENTATIVE',
      'COLOR:#2563eb',
      'DTSTART:20261110T021000Z',
      'DTEND:20261110T035000Z',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT'
    ])

    const [event] = parseIcsEvents(text).events

    expect(event).toMatchObject({
      title: '英美大众文化',
      notes: '第3 - 4节',
      location: '坤銮楼（2号楼）C202',
      url: 'https://example.com/meet',
      attendees: ['齐洁', '李杰'],
      status: 'tentative',
      color: '#2563eb',
      reminder_minutes: [30],
      all_day: false,
      external_id: 'ics:course-1:2026-11-10T02:10:00.000Z'
    })
  })

  it('全天事件按 UTC 日期落库，并用日期键去重', () => {
    const text = wrap([
      'BEGIN:VEVENT',
      'UID:holiday',
      'SUMMARY:纪念日',
      'DTSTART;VALUE=DATE:20261108',
      'DTEND;VALUE=DATE:20261109',
      'END:VEVENT'
    ])

    const [event] = parseIcsEvents(text).events
    const start = new Date(event.start_at)

    expect(event.all_day).toBe(true)
    expect([start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()]).toEqual([2026, 11, 8])
    expect(new Date(event.end_at).getTime() - start.getTime()).toBe(86400000)
    expect(event.external_id).toBe('ics:holiday:2026-11-08')
  })
})

describe('buildIcs', () => {
  it('转义特殊字符并输出可再次解析的日历', () => {
    const schedules = [{
      id: 1,
      title: '评审; 提纲, 初稿',
      notes: '第一行\n第二行',
      start_at: '2026-11-08T01:00:00.000Z',
      end_at: '2026-11-08T02:00:00.000Z',
      updated_at: '2026-11-07T12:00:00.000Z'
    }]

    const content = buildIcs(schedules)

    expect(content).toContain('SUMMARY:评审\\; 提纲\\, 初稿')
    expect(content).toContain('DESCRIPTION:第一行\\n第二行')
    expect(content).toContain('UID:todoheap-1@todoheap')

    const { events } = parseIcsEvents(content)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('评审; 提纲, 初稿')
    expect(events[0].notes).toBe('第一行\n第二行')
  })

  it('长行按 75 字节折行', () => {
    const content = buildIcs([{
      id: 2,
      title: '很长的标题'.repeat(20),
      start_at: '2026-11-08T01:00:00.000Z',
      end_at: '2026-11-08T02:00:00.000Z'
    }])

    expect(content.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
    expect(parseIcsEvents(content).events[0].title).toBe('很长的标题'.repeat(20))
  })

  it('导出结构化字段并可用 parseIcsEvents 还原', () => {
    const content = buildIcs([{
      id: 7,
      title: '课程',
      notes: '第3 - 4节',
      location: '教学楼 C202',
      url: 'https://example.com/class',
      attendees: ['齐洁', '李杰'],
      status: 'tentative',
      color: '#059669',
      reminder_minutes: [10, 30],
      start_at: '2026-11-10T02:10:00.000Z',
      end_at: '2026-11-10T03:50:00.000Z'
    }])

    expect(content).toContain('LOCATION:教学楼 C202')
    expect(content).toContain('URL:https://example.com/class')
    expect(content).toContain('ATTENDEE;CN="齐洁"')
    expect(content).toContain('STATUS:TENTATIVE')
    expect(content).toContain('COLOR:#059669')
    expect(content).toContain('TRIGGER:-PT30M')

    const [event] = parseIcsEvents(content).events
    expect(event).toMatchObject({
      location: '教学楼 C202',
      url: 'https://example.com/class',
      attendees: ['齐洁', '李杰'],
      status: 'tentative',
      color: '#059669',
      reminder_minutes: [10, 30]
    })
  })

  it('全天事件输出 DATE 型时间', () => {
    const start = new Date(Date.UTC(2026, 10, 8))
    const end = new Date(Date.UTC(2026, 10, 9))
    const content = buildIcs([{
      id: 8,
      title: '纪念日',
      all_day: true,
      start_at: start.toISOString(),
      end_at: end.toISOString()
    }])

    expect(content).toContain('DTSTART;VALUE=DATE:20261108')
    expect(content).toContain('DTEND;VALUE=DATE:20261109')
    expect(parseIcsEvents(content).events[0].all_day).toBe(true)
  })
})
