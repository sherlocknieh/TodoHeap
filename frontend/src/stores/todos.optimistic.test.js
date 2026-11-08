import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createTodoOptimisticActions } from './todos.optimistic'

const OperationType = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  PERMANENT_DELETE: 'PERMANENT_DELETE',
  BATCH_DELETE: 'BATCH_DELETE',
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
    const result = await actions.addTodo('  新任务  ', { parent_id: 9 })

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
        parent_id: 9
      })
    }))
  })

  it('updateTodo 对临时任务应只更新队列 payload 并持久化', async () => {
    todosRef.value = [{ id: -1, title: '原任务', completed_at: null, updated_at: 'old' }]
    syncQueue.queue = [{ type: OperationType.ADD, targetId: -1, payload: { title: '原任务', completed_at: null } }]

    const result = await actions.updateTodo(-1, { title: '已修改', completed_at: '2026-01-01T00:00:00.000Z' })

    expect(result.success).toBe(true)
    expect(todosRef.value[0].title).toBe('已修改')
    expect(syncQueue.persistQueue).toHaveBeenCalled()
    expect(syncQueue.enqueue).not.toHaveBeenCalled()
    expect(syncQueue.queue[0].payload).toMatchObject({ title: '已修改', completed_at: '2026-01-01T00:00:00.000Z' })
  })

  it('deleteTodo 应级联移除后代并写入垃圾箱与同步队列', async () => {
    todosRef.value = [
      { id: 1, title: '父任务', child_ids: [2], deleted_at: null },
      { id: 2, title: '子任务', child_ids: [], deleted_at: null },
      { id: 3, title: '无关任务', child_ids: [], deleted_at: null }
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

  it('deleteTodo 在环中不会无限递归', async () => {
    todosRef.value = [
      { id: 1, title: 'A', child_ids: [2], deleted_at: null },
      { id: 2, title: 'B', child_ids: [1], deleted_at: null }
    ]

    const result = await actions.deleteTodo(1)

    expect(result.success).toBe(true)
    expect(todosRef.value).toEqual([])
    expect(trashTodosRef.value.map(item => item.id).sort()).toEqual([1, 2])
  })

  it('deleteCompletedTodos 应逐棵已完成子树删除并入队', async () => {
    todosRef.value = [
      { id: 1, title: '已完成父', completed_at: '2026-01-01T00:00:00.000Z', child_ids: [2], deleted_at: null },
      { id: 2, title: '已完成子', completed_at: '2026-01-01T00:00:00.000Z', child_ids: [3], deleted_at: null },
      { id: 3, title: '未完成子', completed_at: null, child_ids: [], deleted_at: null },
      { id: 4, title: '已完成孤立', completed_at: '2026-01-02T00:00:00.000Z', child_ids: [], deleted_at: null },
      { id: 5, title: '进行中', completed_at: null, child_ids: [], deleted_at: null }
    ]
    trashTodosRef.value = []
    trashLoadingRef.value = false

    const result = await actions.deleteCompletedTodos()

    expect(result).toEqual({ success: true, count: 4 })
    expect(todosRef.value.map(item => item.id)).toEqual([5])
    expect(trashTodosRef.value.map(item => item.id)).toEqual([4, 3, 2, 1])
    // 父任务已完成时后代由级联覆盖，只有子树根进入一次批量删除
    expect(syncQueue.enqueue).toHaveBeenCalledTimes(1)
    expect(syncQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: OperationType.BATCH_DELETE,
      targetId: 'batch-delete-completed',
      payload: expect.objectContaining({ ids: [1, 4] })
    }))
  })

  it('deleteCompletedTodos 在没有已完成任务时不入队', async () => {
    todosRef.value = [{ id: 1, title: '进行中', completed_at: null, child_ids: [], deleted_at: null }]

    const result = await actions.deleteCompletedTodos()

    expect(result).toEqual({ success: true, count: 0 })
    expect(todosRef.value).toHaveLength(1)
    expect(syncQueue.enqueue).not.toHaveBeenCalled()
  })

  it('deleteCompletedTodos 对尚未落库的临时任务只做本地清理', async () => {
    todosRef.value = [
      { id: -1, title: '新完成任务', completed_at: '2026-01-03T00:00:00.000Z', child_ids: [], deleted_at: null }
    ]
    trashTodosRef.value = []
    trashLoadingRef.value = false

    const result = await actions.deleteCompletedTodos()

    expect(result).toEqual({ success: true, count: 1 })
    expect(todosRef.value).toEqual([])
    expect(trashTodosRef.value.map(item => item.id)).toEqual([-1])
    expect(syncQueue.enqueue).not.toHaveBeenCalled()
    expect(syncQueue.clearSnapshot).toHaveBeenCalledWith('batch-delete-completed')
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

  it('deferSync 创建的临时任务应在首次编辑后才入队 ADD', async () => {
    const addResult = await actions.addTodo('新子任务', { parent_id: 1, deferSync: true })

    expect(addResult.success).toBe(true)
    expect(syncQueue.enqueue).not.toHaveBeenCalled()

    const updateResult = await actions.updateTodo(addResult.data.id, { title: '已编辑子任务' })

    expect(updateResult.success).toBe(true)
    expect(syncQueue.enqueue).toHaveBeenCalledTimes(1)
    expect(syncQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: OperationType.ADD,
      targetId: addResult.data.id,
      payload: expect.objectContaining({
        title: '已编辑子任务',
        parent_id: 1,
        user_id: 'user-1'
      })
    }))
  })
})