import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createTodosRealtimeManager } from './todos.realtime'

// 只验证推送处理逻辑, 订阅与网络部分用空实现占位
const createManager = ({ todosRef, queue = [] }) => {
  const syncQueue = {
    queue,
    isTempId: (id) => Number(id) < 0,
    markRemoteUpdate: vi.fn()
  }
  const manager = createTodosRealtimeManager({
    supabaseClient: { channel: () => ({ on: () => ({ subscribe: () => {} }) }), removeChannel: vi.fn() },
    getSyncQueue: () => syncQueue,
    getUserId: () => 'user-1',
    todosRef,
    trashTodosRef: ref([]),
    isTrashFetchedRef: ref(false),
    setRealtimeStatus: vi.fn()
  })
  return { manager, syncQueue }
}

describe('todos realtime 推送处理', () => {
  let todosRef
  let events
  let listeners

  beforeEach(() => {
    todosRef = ref([])
    events = []
    listeners = new Map()
    // 推送处理通过 window 事件通知 store 替换 ID, 这里用最小实现替代浏览器环境
    vi.stubGlobal('window', {
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: vi.fn(),
      dispatchEvent: (event) => listeners.get(event.type)?.(event)
    })
    window.addEventListener('sync:id-replaced', (event) => events.push(event.detail))
    vi.stubGlobal('CustomEvent', class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    })
  })

  it('INSERT 命中本地临时任务的 client_key 时走 ID 替换而不是新增一条', () => {
    todosRef.value = [{ id: -1, title: '新任务', client_key: 'key-1', child_ids: [] }]
    const { manager } = createManager({ todosRef })

    manager.handleRealtimeChange({
      eventType: 'INSERT',
      new: { id: 7, title: '新任务', client_key: 'key-1', child_ids: [], deleted_at: null }
    })

    expect(events).toEqual([{ tempId: -1, realId: 7, data: expect.objectContaining({ id: 7 }) }])
    expect(todosRef.value).toHaveLength(1)
  })

  it('INSERT 没有对应本地临时任务时正常追加', () => {
    const { manager } = createManager({ todosRef })

    manager.handleRealtimeChange({
      eventType: 'INSERT',
      new: { id: 7, title: '别处创建', client_key: 'key-2', child_ids: [], deleted_at: null }
    })

    expect(events).toEqual([])
    expect(todosRef.value.map((todo) => todo.id)).toEqual([7])
  })
})
