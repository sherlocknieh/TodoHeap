import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { persistedRef, readUiState, useScrollMemory, writeUiState } from './uiState'

// 用内存实现代替浏览器 localStorage，覆盖读写与容错分支
const memory = new Map()
const fakeStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
}

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = fakeStorage
})

afterEach(() => {
  delete globalThis.localStorage
})

describe('uiState', () => {
  it('按前缀读写本地状态', () => {
    writeUiState('sidebar-open', false)
    expect(fakeStorage.getItem('todoheap:ui:sidebar-open')).toBe('false')
    expect(readUiState('sidebar-open', true)).toBe(false)
  })

  it('缺失或损坏的值回退到默认值', () => {
    expect(readUiState('missing', 'fallback')).toBe('fallback')
    fakeStorage.setItem('todoheap:ui:broken', '{not json')
    expect(readUiState('broken', 42)).toBe(42)
  })

  it('persistedRef 读取已保存值，变化后自动写回', async () => {
    writeUiState('per-page', 2)
    const page = persistedRef('per-page', 1)
    expect(page.value).toBe(2)

    page.value = 3
    await nextTick()
    expect(readUiState('per-page', 0)).toBe(3)
  })

  it('persistedRef 丢弃不合法旧值', () => {
    writeUiState('tab', 'unknown')
    const tab = persistedRef('tab', 'account', { validate: (value) => ['account', 'import'].includes(value) })
    expect(tab.value).toBe('account')
  })

  it('滚动位置按各自键保存', async () => {
    const container = ref({ scrollTop: 320, scrollHeight: 1000, clientHeight: 400 })
    const { save } = useScrollMemory(container, () => 'list')

    save()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(readUiState('scroll:list', 0)).toBe(320)
  })
})
