// Todo 同步回滚处理
export const createTodoRollbackHandler = ({
  todosRef,
  trashTodosRef,
  errorRef,
  getSyncQueue,
  findTodoIndexById,
  OperationType
}) => {
  const clearFailureErrorLater = () => {
    setTimeout(() => {
      if (errorRef.value?.includes('失败')) {
        errorRef.value = null
      }
    }, 3000)
  }

  const restoreDeleteSnapshot = (targetId, snapshot) => {
    if (!snapshot) return

    todosRef.value.push(snapshot)
    const syncQueue = getSyncQueue()
    const descendantSnapshot = syncQueue.getSnapshot(`${targetId}-descendants`)
    if (descendantSnapshot && Array.isArray(descendantSnapshot)) {
      todosRef.value.push(...descendantSnapshot)
      syncQueue.clearSnapshot(`${targetId}-descendants`)
    }
  }

  const restoreUpdateSnapshot = (targetId, snapshot) => {
    if (!snapshot) return

    const index = findTodoIndexById(targetId)
    if (index !== -1) {
      todosRef.value[index] = snapshot
    }
  }

  const restoreTrashSnapshot = (targetId, snapshot) => {
    if (!snapshot) return

    const index = findTodoIndexById(targetId)
    if (index !== -1) {
      todosRef.value.splice(index, 1)
    }
    trashTodosRef.value.push(snapshot)
  }

  const rollbackHandlers = {
    [OperationType.ADD]: (item) => {
      todosRef.value = todosRef.value.filter(t => t.id !== item.targetId)
      errorRef.value = `添加任务失败: ${item.payload?.title || '未知'}`
    },
    [OperationType.UPDATE]: (item, snapshot) => {
      restoreUpdateSnapshot(item.targetId, snapshot)
      errorRef.value = '更新任务失败，已恢复'
    },
    [OperationType.DELETE]: (item, snapshot) => {
      restoreDeleteSnapshot(item.targetId, snapshot)
      errorRef.value = '删除任务失败，已恢复'
    },
    [OperationType.RESTORE]: (item, snapshot) => {
      restoreTrashSnapshot(item.targetId, snapshot)
      errorRef.value = '恢复任务失败'
    },
    [OperationType.BATCH_PERMANENT_DELETE]: (_, snapshot) => {
      if (snapshot && Array.isArray(snapshot)) {
        trashTodosRef.value = snapshot
      }
      errorRef.value = '清空垃圾箱失败，已恢复'
    },
    [OperationType.BATCH_RESTORE]: (_, snapshot) => {
      if (snapshot) {
        trashTodosRef.value = snapshot.trash || []
        todosRef.value = snapshot.todos || []
      }
      errorRef.value = '恢复全部任务失败，已恢复'
    }
  }

  const handleRollback = (event) => {
    const { item, snapshot } = event.detail
    const handler = rollbackHandlers[item.type]
    if (!handler) return

    handler(item, snapshot)
    clearFailureErrorLater()
  }

  return {
    handleRollback
  }
}
