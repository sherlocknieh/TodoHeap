import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 队列维护是纯内存操作，这里替换掉持久化与网络依赖
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {})
    })
  }
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return { useOnline: () => ref(true) }
})

import { useSyncQueueStore } from './syncQueue'

describe('syncQueue 临时 ID 替换', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('child_ids 换成真实 ID 时保持原顺序与重复项', () => {
    const store = useSyncQueueStore()
    store.queue = [
      { type: 'UPDATE', targetId: 10, payload: { child_ids: [5, -2, 7, -2, 9] } }
    ]

    store.updateQueueTargetIds(-2, 2)

    expect(store.queue[0].payload.child_ids).toEqual([5, 2, 7, 2, 9])
  })

  it('批量 ID 与父级引用同时替换，其它字段保持不变', () => {
    const store = useSyncQueueStore()
    store.queue = [
      {
        type: 'BATCH_PERMANENT_DELETE',
        targetId: 'batch-1',
        payload: { ids: [-3, 4, -3], parent_id: -3, title: '保持不变' }
      }
    ]

    store.updateQueueTargetIds(-3, 3)

    expect(store.queue[0].payload).toEqual({
      ids: [3, 4, 3],
      parent_id: 3,
      title: '保持不变'
    })
  })

  it('队列项自身的 targetId 一并替换', () => {
    const store = useSyncQueueStore()
    store.queue = [{ type: 'UPDATE', targetId: -4, payload: {} }]

    store.updateQueueTargetIds(-4, 4)

    expect(store.queue[0].targetId).toBe(4)
  })
})
