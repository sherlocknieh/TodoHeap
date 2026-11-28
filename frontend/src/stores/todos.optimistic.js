// Todo 乐观更新与级联操作
import { v4 as uuidv4 } from 'uuid'
import { collectCascadeIds, collectDescendantIds, collectIncompleteTreeIds, findParentIds } from '@/utils/taskGraph'

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

  // 软删除只带走没有其它父链接的后代; 永久删除时把活动任务也算作“其它链接”
  const findCascadeDeleteDescendants = (parentId) => collectCascadeIds(todosRef.value, [parentId])
    .filter(id => id !== parentId)
  const findTrashDescendantIds = (parentId) => collectDescendantIds(trashTodosRef.value, parentId)
  const findPermanentDeleteDescendants = (parentId) => collectCascadeIds(
    trashTodosRef.value,
    [parentId],
    { parentItems: [...todosRef.value, ...trashTodosRef.value] }
  ).filter(id => id !== parentId)

  const addTodo = async (title, options = {}) => {
    const auth = requireAuthUser()
    if (!auth.ok) {
      setError('请先登录')
      return auth.result
    }

    const syncQueue = getSyncQueue()
    const tempId = syncQueue.generateTempId()
    // 顶层任务统一挂到根任务下; 根任务还没拉到时先留空, 由服务端 create_todo 兜底
    const rootTaskId = todosRef.value.find(todo => todo.is_root)?.id ?? null
    const parentId = options.parent_id ?? rootTaskId
    // 创建幂等键: 重试与实时回推都靠它认出「同一条任务」
    const clientKey = options.client_key ?? uuidv4()

    const newTodo = {
      id: tempId,
      title: title.trim(),
      user_id: auth.user.id,
      completed_at: null,
      child_ids: [],
      // 仅本地保留的父引用, 用于延迟同步时补入 ADD 队列
      parent_id: parentId,
      client_key: clientKey,
      deadline: options.deadline || null,
      details: options.details || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      duration: options.duration ?? null
    }

    todosRef.value.push(newTodo)

    // 子列表由父节点保存，新任务插到首位，最近添加的先看到；插入位置规则见 docs/src/content/docs/dev/logic/task-order.md
    if (parentId != null) {
      const parent = todosRef.value.find(t => t.id === parentId)
      if (parent) {
        parent.child_ids = [tempId, ...(parent.child_ids || [])]
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
        client_key: clientKey,
        deadline: newTodo.deadline,
        details: newTodo.details,
        duration: newTodo.duration
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
        // ADD 已经发出时改 payload 不会生效, 补一条 UPDATE 在落地后按真实 ID 执行
        if (syncQueue.isOperationActive?.(queueItem.id)) {
          await syncQueue.enqueue({
            type: OperationType.UPDATE,
            targetId: id,
            payload: updates
          })
        }
        return { success: true, data: todosRef.value[index] }
      }

      // 创建已完成但调用方仍拿着临时 ID: 按真实 ID 走普通更新, 不能再补一条 ADD
      if (!syncQueue.isTempId(realId)) {
        await syncQueue.enqueue({
          type: OperationType.UPDATE,
          targetId: realId,
          payload: updates
        })
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
          client_key: current.client_key ?? uuidv4(),
          deadline: current.deadline,
          details: current.details,
          duration: current.duration
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

  // 完成任务树: 只给未完成的写完成时间, 已完成的保留原值;
  // 返回真正被改写的 ID, 供提示里的撤销整批恢复; 机制见 docs/src/content/docs/dev/logic/task-complete-tree.md
  const completeTodoTree = async (id) => {
    const targetIds = collectIncompleteTreeIds(todosRef.value, getSyncQueue().getRealId(id))
    if (!targetIds.length) return { success: true, data: { ids: [] } }

    // 同一时刻完成整棵树, 已完成区按天分组时落在同一天
    const completedAt = new Date().toISOString()
    const changedIds = []
    for (const targetId of targetIds) {
      // child_ids 的残留 ID 或刚好被删掉的任务不报错，静默跳过
      if (!findTodoById(targetId)) continue
      const result = await updateTodo(targetId, { completed_at: completedAt })
      if (!result.success) {
        if (result.error === '任务不存在') continue
        return { success: false, error: result.error, data: { ids: changedIds } }
      }
      changedIds.push(targetId)
    }
    return { success: true, data: { ids: changedIds } }
  }

  // 移动任务：调整父关系或同级顺序；手动序号以 child_ids 为准
  // 取出某一层级当前的兄弟任务；根层级没有容器，用「未被任何父引用」判定
  const siblingIdsOf = (parentId) => {
    const existing = new Set(todosRef.value.map(todo => todo.id))
    if (parentId != null) {
      const parent = todosRef.value.find(todo => todo.id === parentId)
      return (parent?.child_ids || []).filter(childId => existing.has(childId))
    }

    const referenced = new Set()
    todosRef.value.forEach(todo => (todo.child_ids || []).forEach(childId => referenced.add(childId)))
    return todosRef.value.filter(todo => !referenced.has(todo.id)).map(todo => todo.id)
  }

  // 拖放语义分成两条路径：
  // - reorder（落点前/后）：只调整落点所在父级的 child_ids，其它父级不动
  // - move（拖进节点 / 拖到根层级）：只从来源父级摘掉链接，任务保留其它父链接
  const moveTodo = async (id, {
    targetId = null,
    position = 'after',
    sourceParentId = null,
    targetParentId = null
  } = {}) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    const moving = todosRef.value.find(todo => todo.id === realId)
    if (!moving) return { success: false, error: '任务不存在' }

    const realTargetId = targetId == null ? null : syncQueue.getRealId(targetId)
    if (realTargetId === realId) return { success: false, error: '不能移动到自身' }
    if (realTargetId != null && collectDescendantIds(todosRef.value, realId).includes(realTargetId)) {
      return { success: false, error: '禁止形成环形依赖' }
    }

    const target = realTargetId == null ? null : todosRef.value.find(todo => todo.id === realTargetId)
    if (realTargetId != null && !target) return { success: false, error: '目标任务不存在' }

    const rootTaskId = todosRef.value.find(todo => todo.is_root)?.id ?? null
    // 只认当前列表里存在的父级：临时 ID 先映射成真实 ID
    const resolveParent = (value) => {
      if (value == null) return null
      const realParentId = syncQueue.getRealId(value)
      return todosRef.value.some(todo => todo.id === realParentId) ? realParentId : null
    }
    const currentParentIds = findParentIds(todosRef.value, realId)
    // 来源父级优先用拖拽行记录的父级；旧调用没带上下文时退回首个父级
    const sourceParentIdResolved = resolveParent(sourceParentId) ?? currentParentIds[0] ?? null
    // 目标父级：前/后落在落点行所在父级，拖进节点落在该节点，否则落到根任务
    const newParentId = position === 'inside'
      ? (target?.id ?? rootTaskId)
      : (resolveParent(targetParentId)
        ?? (target ? (findParentIds(todosRef.value, target.id)[0] ?? rootTaskId) : rootTaskId))

    // 换父级时只摘来源那一条链接，多父任务的其它父级保持原样
    if (sourceParentIdResolved != null && sourceParentIdResolved !== newParentId) {
      const source = todosRef.value.find(todo => todo.id === sourceParentIdResolved)
      if (source) {
        await updateTodo(sourceParentIdResolved, {
          child_ids: (source.child_ids || []).filter(childId => childId !== realId)
        })
      }
    }

    // 目标父级下沿用 child_ids 现有顺序，去掉自身后插到落点位置
    const siblings = siblingIdsOf(newParentId).filter(siblingId => siblingId !== realId)
    let insertAt = siblings.length
    if (target && position !== 'inside') {
      const targetIndex = siblings.indexOf(target.id)
      insertAt = targetIndex === -1 ? siblings.length : targetIndex + (position === 'after' ? 1 : 0)
    }
    siblings.splice(insertAt, 0, realId)

    if (newParentId != null) {
      const parent = todosRef.value.find(todo => todo.id === newParentId)
      // 已删除子任务的 ID 仍留在子列表里以便恢复, 重排时追加到末尾不丢失
      const knownIds = new Set(todosRef.value.map(todo => todo.id))
      const orphanIds = (parent?.child_ids || []).filter(childId => !knownIds.has(childId))
      await updateTodo(newParentId, { child_ids: [...siblings, ...orphanIds] })
    }

    return { success: true, data: { parentId: newParentId, index: insertAt } }
  }

  // 解除父子链接：最后一个父级被摘掉时把任务挂回根任务，避免出现没有挂载点的孤儿。
  // 返回被改动前的父级/根任务子列表，供撤销还原
  const unlinkTodo = async (parentId, childId) => {
    const parent = todosRef.value.find(todo => todo.id === parentId)
    if (!parent) return { success: false, error: '父任务不存在' }
    if (parent.is_root) return { success: false, error: '根任务的子任务不能直接断开' }

    const previousChildIds = [...(parent.child_ids || [])]
    const nextChildIds = previousChildIds.filter(id => id !== childId)
    if (nextChildIds.length === previousChildIds.length) {
      return { success: true, data: { unchanged: true } }
    }

    const result = await updateTodo(parentId, { child_ids: nextChildIds })
    if (!result.success) return result

    const rootTaskId = todosRef.value.find(todo => todo.is_root)?.id ?? null
    const hasOtherParent = todosRef.value.some(todo => todo.id !== parentId
      && (todo.child_ids || []).includes(childId))
    if (hasOtherParent || rootTaskId == null) {
      return { success: true, data: { previousChildIds, rootChildIds: null } }
    }

    const root = todosRef.value.find(todo => todo.id === rootTaskId)
    const rootChildIds = [...(root?.child_ids || [])]
    if (root && !rootChildIds.includes(childId)) {
      await updateTodo(rootTaskId, { child_ids: [...rootChildIds, childId] })
    }

    return { success: true, data: { previousChildIds, rootChildIds } }
  }

  const deleteTodo = async (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)

    const context = buildCascadeContext(todosRef.value, realId, findCascadeDeleteDescendants)
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

    // 回收站里记录的是真实 ID, 撤销删除时要用它定位
    return { success: true, data: { id: realId } }
  }

  // 一键清理已完成: 只把实际需要删除的根入队, 后代由服务端按同一多父规则级联软删除
  const deleteCompletedTodos = async () => {
    const completedIds = todosRef.value
      .filter(todo => todo.completed_at)
      .map(todo => todo.id)
    if (completedIds.length === 0) return { success: true, count: 0 }

    // 已完成后代默认由祖先级联覆盖；共享的已完成后代会作为显式根补回
    const coveredIds = new Set()
    completedIds.forEach((id) => {
      collectDescendantIds(todosRef.value, id).forEach(childId => coveredIds.add(childId))
    })
    // 共享子任务还有别的父级时保留，只有没有其它链接的后代才跟着进垃圾箱
    let rootIds = completedIds.filter(id => !coveredIds.has(id))
    let idsToRemove = new Set(collectCascadeIds(todosRef.value, rootIds))

    // 共享的已完成任务不会被祖先级联带走，补成显式根一起清理
    const missingRootIds = completedIds.filter(id => !idsToRemove.has(id))
    if (missingRootIds.length > 0) {
      rootIds = [...rootIds, ...missingRootIds]
      idsToRemove = new Set(collectCascadeIds(todosRef.value, rootIds))
    }

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

    return { success: true, count: idsToRemove.size, data: { ids: serverIds } }
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

  // 恢复到根节点：父任务还在回收站时，先断开这些父链接，再把任务挂到根任务下
  // 回收站批量恢复使用；正常恢复仍走 restoreTodo
  const restoreTodoToRoot = async (id) => {
    const syncQueue = getSyncQueue()
    const todo = trashTodosRef.value.find(t => t.id === id)
    if (!todo) return { success: false, error: '任务不存在' }

    // 1. 断开仍在回收站的父级，整数组重写父级 child_ids
    const trashedParentIds = findParentIds(trashTodosRef.value, id)
    for (const parentId of trashedParentIds) {
      const parent = trashTodosRef.value.find(t => t.id === parentId)
      if (!parent) continue
      const nextChildIds = (parent.child_ids || []).filter(childId => childId !== id)
      parent.child_ids = nextChildIds
      await syncQueue.enqueue({
        type: OperationType.UPDATE,
        targetId: parentId,
        payload: { child_ids: nextChildIds }
      })
    }

    // 2. 没有活动父级时补挂到根任务，确保恢复后能在任务表里找到
    const rootTaskId = todosRef.value.find(t => t.is_root)?.id ?? null
    const hasLiveParent = findParentIds(todosRef.value, id).length > 0
    if (!hasLiveParent && rootTaskId != null) {
      const root = todosRef.value.find(t => t.id === rootTaskId)
      const rootChildIds = [...(root?.child_ids || [])]
      if (!rootChildIds.includes(id)) {
        if (root) root.child_ids = [...rootChildIds, id]
        await syncQueue.enqueue({
          type: OperationType.UPDATE,
          targetId: rootTaskId,
          payload: { child_ids: [...rootChildIds, id] }
        })
      }
    }

    return restoreTodo(id)
  }

  const permanentDeleteTodo = async (id) => {
    const syncQueue = getSyncQueue()

    const context = buildCascadeContext(trashTodosRef.value, id, findPermanentDeleteDescendants)
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
    completeTodoTree,
    moveTodo,
    unlinkTodo,
    deleteTodo,
    deleteCompletedTodos,
    restoreTodo,
    restoreTodoToRoot,
    permanentDeleteTodo,
    emptyTrash,
    restoreAllTrash,
    canRestoreTodo,
    findTrashDescendantIds,
    countRestoreTodos
  }
}
