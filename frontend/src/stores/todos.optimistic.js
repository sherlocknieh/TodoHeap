// Todo 乐观更新与级联操作
import { collectDescendantIds, findParentIds } from '@/utils/taskGraph'

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

  // 永久删除后把 ID 从所有父节点的子列表里剔除
  const detachChildIds = (sourceTodos, idsToRemove) => {
    sourceTodos.forEach((todo) => {
      if (Array.isArray(todo.child_ids)) {
        todo.child_ids = todo.child_ids.filter((id) => !idsToRemove.has(id))
      }
    })
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
    const parentId = options.parent_id ?? null

    const newTodo = {
      id: tempId,
      title: title.trim(),
      user_id: auth.user.id,
      completed_at: null,
      child_ids: [],
      // 仅本地保留的父引用, 用于延迟同步时补入 ADD 队列
      parent_id: parentId,
      deadline: options.deadline || null,
      details: options.details || null,
      sort_order: Number.isFinite(options.sort_order) ? options.sort_order : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      difficulty: options.difficulty ?? null
    }

    todosRef.value.push(newTodo)

    // 子列表由父节点保存, 先把临时ID挂到父节点上
    if (parentId != null) {
      const parent = todosRef.value.find(t => t.id === parentId)
      if (parent) {
        parent.child_ids = [...(parent.child_ids || []), tempId]
      }
    }

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
        completed_at: newTodo.completed_at,
        parent_id: parentId,
        deadline: newTodo.deadline,
        details: newTodo.details,
        sort_order: newTodo.sort_order,
        difficulty: newTodo.difficulty
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
          completed_at: current.completed_at,
          parent_id: current.parent_id ?? null,
          deadline: current.deadline,
          details: current.details,
          sort_order: current.sort_order,
          difficulty: current.difficulty
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

    return updateTodo(id, {
      completed_at: todo.completed_at ? null : new Date().toISOString()
    })
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

  // 一键清理已完成: 只把每棵已完成子树的根入队, 后代由服务端级联软删除
  const deleteCompletedTodos = async () => {
    const completedIds = todosRef.value
      .filter(todo => todo.completed_at)
      .map(todo => todo.id)
    if (completedIds.length === 0) return { success: true, count: 0 }

    // 父任务已完成时, 其后代必然由父级级联覆盖, 无需单独删除
    const coveredIds = new Set()
    completedIds.forEach((id) => {
      collectDescendantIds(todosRef.value, id).forEach(childId => coveredIds.add(childId))
    })
    const rootIds = completedIds.filter(id => !coveredIds.has(id))

    const idsToRemove = new Set()
    rootIds.forEach((id) => {
      idsToRemove.add(id)
      findDescendantIds(id).forEach(childId => idsToRemove.add(childId))
    })

    const syncQueue = getSyncQueue()
    const removedSnapshots = collectTodosByIds(todosRef.value, [...idsToRemove])
    if (removedSnapshots.length === 0) return { success: true, count: 0 }

    const deletedAt = new Date().toISOString()
    syncQueue.saveSnapshot('batch-delete-completed', {
      todos: removedSnapshots,
      removedIds: [...idsToRemove]
    })

    removeTodosByIds(todosRef, idsToRemove)
    if (trashTodosRef.value.length > 0 || !trashLoadingRef.value) {
      prependUniqueTodos(
        trashTodosRef,
        removedSnapshots.map(todo => ({ ...todo, deleted_at: deletedAt }))
      )
    }

    // 临时任务还没有服务端记录, 只留在本地回收站
    const serverIds = rootIds
      .map(id => syncQueue.getRealId(id))
      .filter(realId => !syncQueue.isTempId(realId))
    if (serverIds.length > 0) {
      await syncQueue.enqueue({
        type: OperationType.BATCH_DELETE,
        targetId: 'batch-delete-completed',
        payload: { ids: serverIds, deleted_at: deletedAt }
      })
    } else {
      syncQueue.clearSnapshot('batch-delete-completed')
    }

    return { success: true, count: idsToRemove.size }
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
    detachChildIds(todosRef.value, context.idsToRemove)
    detachChildIds(trashTodosRef.value, context.idsToRemove)

    await syncQueue.enqueue({
      type: OperationType.PERMANENT_DELETE,
      targetId: id,
      payload: { ids: [...context.idsToRemove] }
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

    const parentIds = findParentIds(trashTodosRef.value, id)
    if (parentIds.length === 0) {
      return { canRestore: true }
    }

    // 环内的父子会互相阻塞, 检测到回路时允许整体恢复
    const inCycle = parentIds.some(
      (parentId) => parentId === id || collectDescendantIds(trashTodosRef.value, parentId).includes(id)
    )
    if (inCycle) {
      return { canRestore: true }
    }

    const parentInTrash = trashTodosRef.value.find(t => parentIds.includes(t.id))
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
    deleteCompletedTodos,
    restoreTodo,
    permanentDeleteTodo,
    emptyTrash,
    restoreAllTrash,
    canRestoreTodo,
    findTrashDescendantIds,
    countRestoreTodos
  }
}
