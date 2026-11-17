import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 队列逻辑只依赖持久化与 RPC, 这里替换掉 IndexedDB 与网络
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {})
    })
  }
}))

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return { useOnline: () => ref(true) }
})

// client_key 兼容标记是模块级状态, 每个用例重新加载模块, 保证互不影响
const loadStore = async () => {
  vi.resetModules()
  const { useSyncQueueStore } = await import('./syncQueue')
  return useSyncQueueStore()
}

const missingFunction = {
  code: 'PGRST202',
  message: 'Could not find the function public.create_todo(p_client_key, p_title) in the schema cache'
}

describe('create_todo 幂等键兼容', () => {
  let replaced

  beforeEach(() => {
    setActivePinia(createPinia())
    rpc.mockReset()
    replaced = []
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: (event) => replaced.push(event.detail)
    })
    vi.stubGlobal('CustomEvent', class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    })
  })

  it('数据库缺少 client_key 支持时退回旧签名, 任务仍创建成功', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: missingFunction })
      .mockResolvedValueOnce({ data: { id: 5, title: '任务' }, error: null })

    const store = await loadStore()
    await store.enqueue({
      type: 'ADD',
      targetId: -1,
      payload: { title: '任务', user_id: 'user-1', client_key: 'key-1', parent_id: null }
    })
    await vi.waitFor(() => expect(store.queue).toHaveLength(0))

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_client_key: 'key-1' })
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_client_key')
    expect(replaced).toEqual([{ tempId: -1, realId: 5, data: { id: 5, title: '任务' } }])
  })

  it('探测到旧库后, 后续创建不再重复试错', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: missingFunction })
      .mockResolvedValueOnce({ data: { id: 5 }, error: null })
      .mockResolvedValueOnce({ data: { id: 6 }, error: null })

    const store = await loadStore()
    await store.enqueue({ type: 'ADD', targetId: -1, payload: { title: 'A', client_key: 'k1' } })
    await vi.waitFor(() => expect(store.queue).toHaveLength(0))
    await store.enqueue({ type: 'ADD', targetId: -2, payload: { title: 'B', client_key: 'k2' } })
    await vi.waitFor(() => expect(store.queue).toHaveLength(0))

    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_client_key')
    expect(rpc.mock.calls[2][1]).not.toHaveProperty('p_client_key')
  })

  it('服务端支持时只调用一次并携带幂等键', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 7 }, error: null })

    const store = await loadStore()
    await store.enqueue({ type: 'ADD', targetId: -1, payload: { title: '正常', client_key: 'key-1' } })
    await vi.waitFor(() => expect(store.queue).toHaveLength(0))

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_client_key: 'key-1' })
  })
})
