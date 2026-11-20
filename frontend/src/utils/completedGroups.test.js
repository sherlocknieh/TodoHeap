import { describe, expect, it } from 'vitest'
import { dayKeyOf, formatDayLabel, formatCompletionTime, groupCompletedByDay } from './completedGroups'

const now = new Date('2026-11-20T14:34:00')
const at = (value) => new Date(value).toISOString()

describe('dayKeyOf', () => {
  it('按本地自然日生成键', () => {
    expect(dayKeyOf('2026-11-20T23:30:00')).toBe('2026-11-20')
    expect(dayKeyOf('2026-11-21T00:10:00')).toBe('2026-11-21')
  })

  it('无完成时间或非法时间返回空串', () => {
    expect(dayKeyOf(null)).toBe('')
    expect(dayKeyOf('not-a-date')).toBe('')
  })
})

describe('formatDayLabel', () => {
  it('今天与昨天用口语标签', () => {
    expect(formatDayLabel('2026-11-20', now)).toBe('今天')
    expect(formatDayLabel('2026-11-19', now)).toBe('昨天')
  })

  it('更早的日期给月日，跨年补年份', () => {
    expect(formatDayLabel('2026-11-18', now)).toBe('11月18日')
    expect(formatDayLabel('2025-12-31', now)).toBe('2025年12月31日')
  })
})

describe('formatCompletionTime', () => {
  it('行内只显示本地时分', () => {
    expect(formatCompletionTime(new Date(2026, 10, 20, 9, 5).toISOString())).toBe('09:05')
  })

  it('无完成时间或非法时间返回空串', () => {
    expect(formatCompletionTime(null)).toBe('')
    expect(formatCompletionTime('not-a-date')).toBe('')
  })
})

describe('groupCompletedByDay', () => {
  it('按完成日期倒序分组，组内按完成时间倒序', () => {
    const groups = groupCompletedByDay([
      { id: 1, completed_at: at('2026-11-18T09:00:00') },
      { id: 2, completed_at: at('2026-11-20T09:00:00') },
      { id: 3, completed_at: at('2026-11-20T18:00:00') },
      { id: 4, completed_at: null }
    ], now)

    expect(groups.map(group => group.key)).toEqual(['2026-11-20', '2026-11-18'])
    expect(groups[0]).toMatchObject({ label: '今天', count: 2 })
    expect(groups[0].todos.map(todo => todo.id)).toEqual([3, 2])
    expect(groups[1]).toMatchObject({ label: '11月18日', count: 1 })
  })

  it('全部未完成时返回空分组', () => {
    expect(groupCompletedByDay([{ id: 1, completed_at: null }], now)).toEqual([])
  })
})
