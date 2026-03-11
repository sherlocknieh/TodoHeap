// Todo 乐观更新与级联操作
export const createTodoOptimisticActions = ({
  todosRef,
  trashTodosRef,
  trashLoadingRef,
  getSyncQueue,
  requireAuthUser,
  setError,
  OperationType
}) => {
  const findTodoById = (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    return todosRef.value.find(t => t.id === id || t.id === realId)
  }

  const findTodoIndexById = (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    return todosRef.value.findIndex(t => t.id === id || t.id === realId)
  }

  const collectDescendantIds = (sourceTodos, parentId) => {
    const descendants = []
    const findChildren = (pid) => {
      sourceTodos.forEach(t => {
        if (t.parent_id === pid) {
          descendants.push(t.id)
          findChildren(t.id)
        }
      })
    }
    findChildren(parentId)
    return descendants
  }

  const collectTodosByIds = (sourceTodos, ids) => {
    if (!ids.length) return []
    return ids
      .map(id => sourceTodos.find(t => t.id === id))
      .filter(Boolean)
      .map(todo => ({ ...todo }))
  }

  const removeTodosByIds = (targetRef, idsToRemove) => {
    targetRef.value = targetRef.value.filter(t => !idsToRemove.has(t.id))
  }

  const prependUniqueTodos = (targetRef, items) => {
    items.forEach(item => {
      if (!targetRef.value.find(t => t.id === item.id)) {
        targetRef.value.unshift(item)
      }
    })
  }

  const buildCascadeContext = (sourceTodos, rootId, findDescendants) => {
    const rootIndex = sourceTodos.findIndex(t => t.id === rootId)
    if (rootIndex === -1) {
      return null
    }

    const rootTodo = sourceTodos[rootIndex]
    const descendantIds = findDescendants(rootId)
    const descendantSnapshots = collectTodosByIds(sourceTodos, descendantIds)
    const idsToRemove = new Set([rootId, ...descendantIds])

    return {
      rootTodo,
      descendantSnapshots,
      idsToRemove
    }
  }

  const saveCascadeSnapshots = (syncQueue, rootKey, rootTodo, descendantSnapshots, descendantKey) => {
    syncQueue.saveSnapshot(rootKey, { ...rootTodo })
    if (descendantSnapshots.length > 0) {
      syncQueue.saveSnapshot(descendantKey, descendantSnapshots)
    }
  }

  const findDescendantIds = (parentId) => collectDescendantIds(todosRef.value, parentId)
  const findTrashDescendantIds = (parentId) => collectDescendantIds(trashTodosRef.value, parentId)

  const addTodo = async (title, options = {}) => {
    const auth = requireAuthUser()
    if (!auth.ok) {
      setError('请先登录')
      return auth.result
    }

    const syncQueue = getSyncQueue()
    const tempId = syncQueue.generateTempId()

    const newTodo = {
      id: tempId,
      title: title.trim(),
      user_id: auth.user.id,
      status: options.status || 'todo',
      priority: options.priority ?? 0,
      parent_id: options.parent_id || null,
      deadline: options.deadline || null,
      description: options.description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      difficulty: null
    }

    todosRef.value.push(newTodo)

    // 延迟同步：先仅本地创建，待首次编辑后再入队 ADD
    if (options.deferSync) {
      return { success: true, data: newTodo }
    }

    await syncQueue.enqueue({
      type: OperationType.ADD,
      targetId: tempId,
      payload: {
        title: newTodo.title,
        user_id: newTodo.user_id,
        status: newTodo.status,
        priority: newTodo.priority,
        parent_id: newTodo.parent_id,
        deadline: newTodo.deadline,
        description: newTodo.description
      }
    })

    return { success: true, data: newTodo }
  }

  const updateTodo = async (id, updates) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)

    const index = findTodoIndexById(id)
    if (index === -1) {
      return { success: false, error: '任务不存在' }
    }

    const originalTodo = todosRef.value[index]
    syncQueue.saveSnapshot(realId, { ...originalTodo })

    todosRef.value[index] = {
      ...originalTodo,
      ...updates,
      updated_at: new Date().toISOString()
    }

    if (syncQueue.isTempId(id)) {
      const queueItem = syncQueue.queue.find(
        item => item.type === OperationType.ADD && item.targetId === id
      )
      if (queueItem) {
        Object.assign(queueItem.payload, updates)
        await syncQueue.persistQueue()
        return { success: true, data: todosRef.value[index] }
      }

      // 延迟同步创建的临时任务：首次编辑时补入 ADD
      const current = todosRef.value[index]
      await syncQueue.enqueue({
        type: OperationType.ADD,
        targetId: id,
        payload: {
          title: current.title,
          user_id: current.user_id,
          status: current.status,
          priority: current.priority,
          parent_id: current.parent_id,
          deadline: current.deadline,
          description: current.description
        }
      })
      return { success: true, data: current }
    }

    await syncQueue.enqueue({
      type: OperationType.UPDATE,
      targetId: realId,
      payload: updates
    })

    return { success: true, data: todosRef.value[index] }
  }

  const toggleDone = async (id) => {
    const todo = findTodoById(id)
    if (!todo) return { success: false, error: '任务不存在' }

    const nextStatus = todo.status === 'done' ? 'todo' : 'done'
    return updateTodo(id, { status: nextStatus })
  }

  const deleteTodo = async (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)

    const context = buildCascadeContext(todosRef.value, realId, findDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    saveCascadeSnapshots(
      syncQueue,
      realId,
      context.rootTodo,
      context.descendantSnapshots,
      `${realId}-descendants`
    )

    removeTodosByIds(todosRef, context.idsToRemove)

    const deletedAt = new Date().toISOString()
    const deletedTodo = { ...context.rootTodo, deleted_at: deletedAt }

    if (trashTodosRef.value.length > 0 || !trashLoadingRef.value) {
      prependUniqueTodos(trashTodosRef, [deletedTodo])
      prependUniqueTodos(
        trashTodosRef,
        context.descendantSnapshots.map(descTodo => ({ ...descTodo, deleted_at: deletedAt }))
      )
    }

    if (syncQueue.isTempId(id)) {
      syncQueue.clearSnapshot(realId)
      syncQueue.clearSnapshot(`${realId}-descendants`)
      return { success: true }
    }

    await syncQueue.enqueue({
      type: OperationType.DELETE,
      targetId: realId,
      payload: { deleted_at: deletedAt }
    })

    return { success: true }
  }

  const restoreTodo = async (id) => {
    const syncQueue = getSyncQueue()

    const context = buildCascadeContext(trashTodosRef.value, id, findTrashDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    saveCascadeSnapshots(syncQueue, id, context.rootTodo, context.descendantSnapshots, `${id}-trash-descendants`)

    removeTodosByIds(trashTodosRef, context.idsToRemove)

    const restoredTodo = { ...context.rootTodo, deleted_at: null }
    todosRef.value.push(restoredTodo)
    context.descendantSnapshots.forEach(descTodo => {
      todosRef.value.push({ ...descTodo, deleted_at: null })
    })

    await syncQueue.enqueue({
      type: OperationType.RESTORE,
      targetId: id,
      payload: { deleted_at: null }
    })

    return { success: true, data: restoredTodo }
  }

  const permanentDeleteTodo = async (id) => {
    const syncQueue = getSyncQueue()

    const context = buildCascadeContext(trashTodosRef.value, id, findTrashDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    saveCascadeSnapshots(syncQueue, id, context.rootTodo, context.descendantSnapshots, `${id}-trash-descendants`)

    removeTodosByIds(trashTodosRef, context.idsToRemove)

    await syncQueue.enqueue({
      type: OperationType.PERMANENT_DELETE,
      targetId: id,
      payload: {}
    })

    return { success: true }
  }

  const emptyTrash = async () => {
    const auth = requireAuthUser()
    if (!auth.ok) return auth.result

    const syncQueue = getSyncQueue()
    const trashSnapshot = [...trashTodosRef.value]
    syncQueue.saveSnapshot('batch-empty-trash', trashSnapshot)

    trashTodosRef.value = []

    await syncQueue.enqueue({
      type: OperationType.BATCH_PERMANENT_DELETE,
      targetId: 'batch-empty-trash',
      payload: { user_id: auth.user.id }
    })

    return { success: true }
  }

  const restoreAllTrash = async () => {
    const auth = requireAuthUser()
    if (!auth.ok) return auth.result

    const syncQueue = getSyncQueue()
    const trashSnapshot = [...trashTodosRef.value]
    const todosSnapshot = [...todosRef.value]
    syncQueue.saveSnapshot('batch-restore-all', { trash: trashSnapshot, todos: todosSnapshot })

    const restoredTodos = trashTodosRef.value.map(t => ({ ...t, deleted_at: null }))
    todosRef.value.push(...restoredTodos)
    trashTodosRef.value = []

    await syncQueue.enqueue({
      type: OperationType.BATCH_RESTORE,
      targetId: 'batch-restore-all',
      payload: { user_id: auth.user.id }
    })

    return { success: true }
  }

  const canRestoreTodo = (id) => {
    const todo = trashTodosRef.value.find(t => t.id === id)
    if (!todo) return { canRestore: false, reason: '任务不存在' }

    if (!todo.parent_id) {
      return { canRestore: true }
    }

    const parentInTrash = trashTodosRef.value.find(t => t.id === todo.parent_id)
    if (parentInTrash) {
      return {
        canRestore: false,
        reason: '请先恢复父任务',
        parentId: parentInTrash.id,
        parentTitle: parentInTrash.title
      }
    }

    return { canRestore: true }
  }

  const countRestoreTodos = (id) => {
    const descendantIds = findTrashDescendantIds(id)
    return 1 + descendantIds.length
  }

  return {
    findTodoById,
    findTodoIndexById,
    addTodo,
    updateTodo,
    toggleDone,
    deleteTodo,
    restoreTodo,
    permanentDeleteTodo,
    emptyTrash,
    restoreAllTrash,
    canRestoreTodo,
    findTrashDescendantIds,
    countRestoreTodos
  }
}
