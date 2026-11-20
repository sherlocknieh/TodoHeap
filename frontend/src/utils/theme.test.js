import { describe, expect, it } from 'vitest'
import { nextThemeMode, normalizeThemeMode, resolveTheme } from './theme'

describe('theme', () => {
  it('auto 跟随系统亮暗', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('手动模式忽略系统偏好', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('非法偏好回退到 auto', () => {
    expect(normalizeThemeMode('sepia')).toBe('auto')
    expect(resolveTheme('sepia', true)).toBe('dark')
  })

  it('顶栏循环顺序为 跟随系统 → 浅色 → 深色 → 跟随系统', () => {
    expect(nextThemeMode('auto')).toBe('light')
    expect(nextThemeMode('light')).toBe('dark')
    expect(nextThemeMode('dark')).toBe('auto')
    expect(nextThemeMode('sepia')).toBe('light')
  })
})
