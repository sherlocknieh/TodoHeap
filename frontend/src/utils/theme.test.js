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

  it('点击按 浅色 → 深色 → 自动 循环', () => {
    expect(nextThemeMode('light')).toBe('dark')
    expect(nextThemeMode('dark')).toBe('auto')
    expect(nextThemeMode('auto')).toBe('light')
  })

  it('非法偏好先回退 auto 再取下一档', () => {
    expect(nextThemeMode('sepia')).toBe('light')
  })
})
