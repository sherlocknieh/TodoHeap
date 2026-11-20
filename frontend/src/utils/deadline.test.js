import { afterEach, describe, expect, it, vi } from 'vitest'
import { deadlineCountdown, deadlineUrgency, formatDeadlineShort, resolveDeadlinePreset } from './deadline'

const now = new Date('2026-11-20T14:34:00')
const at = (value) => new Date(value).toISOString()

describe('deadlineUrgency', () => {
  it('无截止日期或非法日期不提示', () => {
    expect(deadlineUrgency(null, now)).toBe(null)
    expect(deadlineUrgency('', now)).toBe(null)
    expect(deadlineUrgency('not-a-date', now)).toBe(null)
  })

  it('逾期与一天内都为 critical', () => {
    expect(deadlineUrgency(at('2026-11-18T09:00:00'), now)).toBe('critical')
    expect(deadlineUrgency(at('2026-11-20T23:59:00'), now)).toBe('critical')
    expect(deadlineUrgency(at('2026-11-21T23:59:00'), now)).toBe('critical')
  })

  it('三天内为 urgent，一周内为 soon', () => {
    expect(deadlineUrgency(at('2026-11-22T09:00:00'), now)).toBe('urgent')
    expect(deadlineUrgency(at('2026-11-23T23:59:00'), now)).toBe('urgent')
    expect(deadlineUrgency(at('2026-11-24T09:00:00'), now)).toBe('soon')
    expect(deadlineUrgency(at('2026-11-27T23:59:00'), now)).toBe('soon')
  })

  it('一周以外不提示', () => {
    expect(deadlineUrgency(at('2026-11-28T09:00:00'), now)).toBe(null)
  })
})

describe('deadlineCountdown', () => {
  it('按自然日给出逾期与倒数文案', () => {
    expect(deadlineCountdown(at('2026-11-18T09:00:00'), now)).toBe('已逾期 2 天')
    expect(deadlineCountdown(at('2026-11-20T23:59:00'), now)).toBe('今天到期')
    expect(deadlineCountdown(at('2026-11-21T09:00:00'), now)).toBe('明天到期')
    expect(deadlineCountdown(at('2026-11-25T09:00:00'), now)).toBe('还剩 5 天')
  })

  it('无截止日期返回空串', () => {
    expect(deadlineCountdown(null, now)).toBe('')
  })
})

describe('formatDeadlineShort', () => {
  it('节点右区只放简短倒数', () => {
    expect(formatDeadlineShort(at('2026-11-18T09:00:00'), now)).toBe('逾期')
    expect(formatDeadlineShort(at('2026-11-20T23:59:00'), now)).toBe('今天')
    expect(formatDeadlineShort(at('2026-11-21T09:00:00'), now)).toBe('明天')
    expect(formatDeadlineShort(at('2026-11-25T09:00:00'), now)).toBe('5天')
  })

  it('无截止日期返回空串', () => {
    expect(formatDeadlineShort(null, now)).toBe('')
  })
})

describe('resolveDeadlinePreset', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('一周后落在下周同一天的结束时刻', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(resolveDeadlinePreset('week')).toBe(at('2026-11-27T23:59:00'))
  })
})
