import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createTodoRollbackHandler } from './todos.rollback'

const OperationType = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  BATCH_RESTORE: 'BATCH_RESTORE',
  BATCH_PERMANENT_DELETE: 'BATCH_PERMANENT_DELETE'
}

describe('createTodoRollbackHandler', () => {
  let todosRef
  let trashTodosRef
  let errorRef
  let getSnapshot
  let clearSnapshot
  let handleRollback

  beforeEach(() => {
    vi.useFakeTimers()
    todosRef = ref([])
    trashTodosRef = ref([])
    errorRef = ref(null)
    getSnapshot = vi.fn()
    clearSnapshot = vi.fn()

    handleRollback = createTodoRollbackHandler({
      todosRef,
      trashTodosRef,
      errorRef,
      getSyncQueue: () => ({ getSnapshot, clearSnapshot }),
      findTodoIndexById: (id) => todosRef.value.findIndex(item => item.id === id),
      OperationType
    }).handleRollback
  })

  it('DELETE 回滚应恢复父任务和后代快照，并清理后代快照缓存', () => {
    getSnapshot.mockReturnValue([{ id: 2, title: '子任务' }])

    handleRollback({
      detail: {
        item: { type: OperationType.DELETE, targetId: 1 },
        snapshot: { id: 1, title: '父任务' }
      }
    })

    expect(todosRef.value).toEqual([
      { id: 1, title: '父任务' },
      { id: 2, title: '子任务' }
    ])
    expect(errorRef.value).toBe('删除任务失败，已恢复')
    expect(clearSnapshot).toHaveBeenCalledWith('1-descendants')

    vi.advanceTimersByTime(3000)
    expect(errorRef.value).toBeNull()
  })

  it('RESTORE 回滚应将任务从正常列表移回垃圾箱', () => {
    todosRef.value = [{ id: 5, title: '恢复中的任务' }]

    handleRollback({
      detail: {
        item: { type: OperationType.RESTORE, targetId: 5 },
        snapshot: { id: 5, title: '恢复中的任务', deleted_at: '2026-01-01T00:00:00.000Z' }
      }
    })

    expect(todosRef.value).toEqual([])
    expect(trashTodosRef.value).toEqual([
      { id: 5, title: '恢复中的任务', deleted_at: '2026-01-01T00:00:00.000Z' }
    ])
    expect(errorRef.value).toBe('恢复任务失败')

    vi.advanceTimersByTime(3000)
    expect(errorRef.value).toBeNull()
  })

  it('BATCH_RESTORE 回滚应恢复 todos 与 trash 快照', () => {
    handleRollback({
      detail: {
        item: { type: OperationType.BATCH_RESTORE, targetId: 'batch-restore-all' },
        snapshot: {
          trash: [{ id: 9, title: '垃圾任务' }],
          todos: [{ id: 1, title: '现有任务' }]
        }
      }
    })

    expect(trashTodosRef.value).toEqual([{ id: 9, title: '垃圾任务' }])
    expect(todosRef.value).toEqual([{ id: 1, title: '现有任务' }])
    expect(errorRef.value).toBe('恢复全部任务失败，已恢复')
  })
})