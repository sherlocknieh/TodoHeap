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
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn()
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args) => mocks.rpc(...args),
    from: () => ({
      update: (payload) => ({
        eq: () => ({
          select: () => ({
            single: () => mocks.update(payload)
          })
        })
      })
    })
  }
}))
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return { useOnline: () => ref(true) }
})

import { useSyncQueueStore } from './syncQueue'

describe('syncQueue 临时 ID 替换', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.rpc.mockReset()
    mocks.update.mockReset()
    mocks.update.mockImplementation(async (payload) => ({
      data: { id: 9, child_ids: payload.child_ids },
      error: null
    }))
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })
    vi.stubGlobal('CustomEvent', class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    })
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

  it('child_ids 里的临时任务没落地前不发送父级 UPDATE', async () => {
    let resolveAdd
    mocks.rpc.mockImplementation(() => new Promise((resolve) => { resolveAdd = resolve }))

    const store = useSyncQueueStore()
    store.queue = [
      {
        id: 'add-1',
        type: 'ADD',
        targetId: -1,
        payload: { title: '新任务', user_id: 'user-1', parent_id: 9, client_key: 'key-1' },
        retryCount: 0
      },
      { id: 'upd-1', type: 'UPDATE', targetId: 9, payload: { child_ids: [-1, 4] }, retryCount: 0 }
    ]

    const processing = store.processQueue()
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    // 与 ADD 并行发出会把 -1 写进父级, 并用缺少新任务的快照覆盖本地父级
    expect(mocks.update).not.toHaveBeenCalled()

    resolveAdd({ data: { id: 5, title: '新任务' }, error: null })
    await processing

    expect(mocks.update).toHaveBeenCalledWith({ child_ids: [5, 4] })
  })

  it('临时 ID 从大编号起步, 不复用历史残留的小负数', () => {
    const store = useSyncQueueStore()

    // 旧实现每次重载都从 -1 计数, 会与父级 child_ids 里残留的旧临时 ID 撞号
    expect(store.generateTempId()).toBeLessThan(-1e12)
  })

  it('临时任务已回滚时剔除死引用, 队列继续执行', async () => {
    const store = useSyncQueueStore()
    store.queue = [
      { id: 'upd-2', type: 'UPDATE', targetId: 9, payload: { child_ids: [-7, 4] }, retryCount: 0 }
    ]

    await store.processQueue()

    expect(mocks.update).toHaveBeenCalledWith({ child_ids: [4] })
  })
})
