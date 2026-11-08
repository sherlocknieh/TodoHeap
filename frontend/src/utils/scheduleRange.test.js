import { describe, expect, it } from 'vitest'
import { scheduleRangeOf } from './scheduleRange'

const now = new Date('2026-05-10T12:00:00')

const event = (start, end) => ({ start_at: start, end_at: end })

describe('scheduleRangeOf', () => {
  it('今天内的事件算今天', () => {
    expect(scheduleRangeOf(event('2026-05-10T08:00:00', '2026-05-10T09:00:00'), now)).toBe('today')
  })

  it('跨天进行中的事件算今天', () => {
    expect(scheduleRangeOf(event('2026-05-09T22:00:00', '2026-05-10T02:00:00'), now)).toBe('today')
  })

  it('昨天结束的事件算已过去', () => {
    expect(scheduleRangeOf(event('2026-05-09T08:00:00', '2026-05-09T09:00:00'), now)).toBe('past')
  })

  it('正好在今天零点结束的事件算已过去', () => {
    expect(scheduleRangeOf(event('2026-05-09T22:00:00', '2026-05-10T00:00:00'), now)).toBe('past')
  })

  it('明天开始的事件算以后', () => {
    expect(scheduleRangeOf(event('2026-05-11T08:00:00', '2026-05-11T09:00:00'), now)).toBe('future')
  })
})
