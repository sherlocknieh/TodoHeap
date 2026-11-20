import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildMonthGrid,
  clampHour,
  clampMinute,
  formatPickerLabel,
  parseLocalValue,
  shiftMonth,
  toDateValue,
  toDateTimeValue
} from './datePicker'

describe('parseLocalValue', () => {
  it('按本地时间解析 date 与 datetime-local', () => {
    const dateOnly = parseLocalValue('2026-11-20')
    expect([dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate()]).toEqual([2026, 10, 20])
    expect([dateOnly.getHours(), dateOnly.getMinutes()]).toEqual([0, 0])

    const withTime = parseLocalValue('2026-11-20T23:59')
    expect([withTime.getHours(), withTime.getMinutes()]).toEqual([23, 59])
  })

  it('空值与非法值返回 null', () => {
    expect(parseLocalValue('')).toBe(null)
    expect(parseLocalValue(null)).toBe(null)
    expect(parseLocalValue('not-a-date')).toBe(null)
  })
})

describe('buildMonthGrid', () => {
  it('周一起始，固定 42 天并标记跨月', () => {
    const days = buildMonthGrid(2026, 10, new Date('2026-11-20T10:00:00'))
    expect(days).toHaveLength(42)
    // 2026-11-01 是周日，网格从 10-26（周一）开始
    expect(days[0].key).toBe('2026-10-26')
    expect(days[0].inMonth).toBe(false)
    expect(days[6].key).toBe('2026-11-01')
    expect(days[6].inMonth).toBe(true)
    expect(days[41].key).toBe('2026-12-06')
    expect(days.find((day) => day.key === '2026-11-20').isToday).toBe(true)
  })
})

describe('shiftMonth', () => {
  it('跨年自动折算', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })
})

describe('时分与展示', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('时分限幅在有效范围内', () => {
    expect(clampHour(25)).toBe(23)
    expect(clampHour(-1)).toBe(0)
    expect(clampHour('')).toBe(0)
    expect(clampMinute(59)).toBe(59)
    expect(clampMinute(75)).toBe(59)
  })

  it('字符串互转保持 datetime-local 格式', () => {
    const date = new Date(2026, 10, 20, 9, 5)
    expect(toDateValue(date)).toBe('2026-11-20')
    expect(toDateTimeValue(date)).toBe('2026-11-20T09:05')
  })

  it('同年只写月日，跨年补年份；日期模式始终带年份', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T10:00:00'))
    expect(formatPickerLabel('2026-11-21T09:00', 'datetime')).toBe('11月21日 09:00')
    expect(formatPickerLabel('2027-01-02T09:00', 'datetime')).toBe('2027年1月2日 09:00')
    expect(formatPickerLabel('2026-11-21', 'date')).toBe('2026年11月21日')
    expect(formatPickerLabel('', 'datetime')).toBe('')
  })
})
