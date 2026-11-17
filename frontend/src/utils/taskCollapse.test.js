import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 用内存实现代替浏览器 localStorage，并在每个用例前重置模块以隔离共享状态
const memory = new Map()
const fakeStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
}

const load = () => import('./taskCollapse')

beforeEach(() => {
  vi.resetModules()
  memory.clear()
  globalThis.localStorage = fakeStorage
})

afterEach(() => {
  delete globalThis.localStorage
})

describe('taskCollapse', () => {
  it('未记录的任务使用视图自己的默认值', async () => {
    const { isTaskCollapsed } = await load()

    expect(isTaskCollapsed(1)).toBe(false)
    expect(isTaskCollapsed(1, true)).toBe(true)
  })

  it('显式切换后写入共享集合', async () => {
    const { isTaskCollapsed, toggleTaskCollapsed, collapsedTaskSet } = await load()

    toggleTaskCollapsed(1)

    expect(isTaskCollapsed(1)).toBe(true)
    expect(collapsedTaskSet.value.has('1')).toBe(true)
  })

  it('首次加载时迁移图与回收站的旧折叠键', async () => {
    memory.set('todoheap:ui:mindmap-collapsed', JSON.stringify([1, 2]))
    memory.set('todoheap:ui:trash-expanded', JSON.stringify({ 3: false, 4: true }))

    const { isTaskCollapsed } = await load()

    expect(isTaskCollapsed(1)).toBe(true)
    expect(isTaskCollapsed(2)).toBe(true)
    expect(isTaskCollapsed(3)).toBe(true)
    expect(isTaskCollapsed(4)).toBe(false)
  })

  it('按森林清理已删除任务的折叠记录', async () => {
    const { isTaskCollapsed, pruneTaskCollapseTree, setTaskCollapsed } = await load()

    setTaskCollapsed(1, true)
    setTaskCollapsed(2, true)
    setTaskCollapsed('root', true)
    pruneTaskCollapseTree([
      { id: 'root', children: [{ id: 1, children: [] }] }
    ], { keep: ['root'] })

    expect(isTaskCollapsed(1)).toBe(true)
    expect(isTaskCollapsed(2)).toBe(false)
    expect(isTaskCollapsed('root')).toBe(true)
  })
})
