import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createTodoOptimisticActions } from './todos.optimistic'

const OperationType = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  PERMANENT_DELETE: 'PERMANENT_DELETE',
  BATCH_RESTORE: 'BATCH_RESTORE',
  BATCH_PERMANENT_DELETE: 'BATCH_PERMANENT_DELETE'
}

const createSyncQueueMock = (overrides = {}) => ({
  queue: [],
  generateTempId: vi.fn(() => -1),
  getRealId: vi.fn((id) => id),
  isTempId: vi.fn((id) => Number(id) < 0),
  enqueue: vi.fn(async () => 'queue-id'),
  saveSnapshot: vi.fn(),
  clearSnapshot: vi.fn(),
  persistQueue: vi.fn(async () => {}),
  ...overrides
})

describe('createTodoOptimisticActions', () => {
  let todosRef
  let trashTodosRef
  let trashLoadingRef
  let syncQueue
  let setError
  let actions

  beforeEach(() => {
    todosRef = ref([])
    trashTodosRef = ref([])
    trashLoadingRef = ref(false)
    syncQueue = createSyncQueueMock()
    setError = vi.fn()

    actions = createTodoOptimisticActions({
      todosRef,
      trashTodosRef,
      trashLoadingRef,
      getSyncQueue: () => syncQueue,
      requireAuthUser: () => ({ ok: true, user: { id: 'user-1' } }),
      setError,
      OperationType
    })
  })

  it('addTodo 在已登录时应创建临时任务并入同步队列', async () => {
    const result = await actions.addTodo('  新任务  ', { priority: 3, parent_id: 9 })

    expect(result.success).toBe(true)
    expect(result.data.id).toBe(-1)
    expect(result.data.title).toBe('新任务')
    expect(todosRef.value).toHaveLength(1)
    expect(syncQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: OperationType.ADD,
      targetId: -1,
      payload: expect.objectContaining({
        title: '新任务',
        user_id: 'user-1',
        priority: 3,
        parent_id: 9
      })
    }))
  })

  it('updateTodo 对临时任务应只更新队列 payload 并持久化', async () => {
    todosRef.value = [{ id: -1, title: '原任务', status: 'todo', updated_at: 'old' }]
    syncQueue.queue = [{ type: OperationType.ADD, targetId: -1, payload: { title: '原任务', status: 'todo' } }]

    const result = await actions.updateTodo(-1, { title: '已修改', status: 'doing' })

    expect(result.success).toBe(true)
    expect(todosRef.value[0].title).toBe('已修改')
    expect(syncQueue.persistQueue).toHaveBeenCalled()
    expect(syncQueue.enqueue).not.toHaveBeenCalled()
    expect(syncQueue.queue[0].payload).toMatchObject({ title: '已修改', status: 'doing' })
  })

  it('deleteTodo 应级联移除后代并写入垃圾箱与同步队列', async () => {
    todosRef.value = [
      { id: 1, title: '父任务', parent_id: null, deleted_at: null },
      { id: 2, title: '子任务', parent_id: 1, deleted_at: null },
      { id: 3, title: '无关任务', parent_id: null, deleted_at: null }
    ]
    trashTodosRef.value = []
    trashLoadingRef.value = false

    const result = await actions.deleteTodo(1)

    expect(result.success).toBe(true)
    expect(todosRef.value.map(item => item.id)).toEqual([3])
    expect(trashTodosRef.value.map(item => item.id)).toEqual([2, 1])
    expect(syncQueue.saveSnapshot).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1 }))
    expect(syncQueue.saveSnapshot).toHaveBeenCalledWith('1-descendants', [expect.objectContaining({ id: 2 })])
    expect(syncQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: OperationType.DELETE,
      targetId: 1
    }))
  })

  it('restoreAllTrash 应恢复所有任务并加入批量恢复队列', async () => {
    todosRef.value = [{ id: 10, title: '现有任务', deleted_at: null }]
    trashTodosRef.value = [
      { id: 20, title: '垃圾任务', deleted_at: '2026-01-01T00:00:00.000Z' }
    ]

    const result = await actions.restoreAllTrash()

    expect(result.success).toBe(true)
    expect(trashTodosRef.value).toEqual([])
    expect(todosRef.value.map(item => item.id)).toEqual([10, 20])
    expect(todosRef.value[1].deleted_at).toBeNull()
    expect(syncQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: OperationType.BATCH_RESTORE,
      targetId: 'batch-restore-all',
      payload: { user_id: 'user-1' }
    }))
  })

  it('未登录 addTodo 应返回失败并设置错误', async () => {
    actions = createTodoOptimisticActions({
      todosRef,
      trashTodosRef,
      trashLoadingRef,
      getSyncQueue: () => syncQueue,
      requireAuthUser: () => ({ ok: false, result: { success: false, error: '请先登录' } }),
      setError,
      OperationType
    })

    const result = await actions.addTodo('任务')

    expect(result).toEqual({ success: false, error: '请先登录' })
    expect(setError).toHaveBeenCalledWith('请先登录')
    expect(syncQueue.enqueue).not.toHaveBeenCalled()
  })
})