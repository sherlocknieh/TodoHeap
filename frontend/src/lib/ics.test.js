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
})
