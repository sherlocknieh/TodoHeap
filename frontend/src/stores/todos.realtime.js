// Todo Realtime 管理
export const createTodosRealtimeManager = ({
  supabaseClient,
  getSyncQueue,
  getUserId,
  todosRef,
  trashTodosRef,
  trashLoadingRef
}) => {
  let realtimeChannel = null

  const upsertTodoById = (targetRef, todo, prepend = false) => {
    const index = targetRef.value.findIndex(t => t.id === todo.id)
    if (index !== -1) {
      targetRef.value[index] = todo
      return
    }
    if (prepend) {
      targetRef.value.unshift(todo)
    } else {
      targetRef.value.push(todo)
    }
  }

  const removeTodoById = (targetRef, id) => {
    const index = targetRef.value.findIndex(t => t.id === id)
    if (index !== -1) {
      targetRef.value.splice(index, 1)
    }
  }

  const shouldMaintainTrash = () => trashTodosRef.value.length > 0 || trashLoadingRef.value === false

  const handleRealtimeInsert = (record) => {
    if (record.deleted_at === null) {
      upsertTodoById(todosRef, record)
    }
  }

  const handleRealtimeDeletedState = (record) => {
    removeTodoById(todosRef, record.id)
    if (shouldMaintainTrash()) {
      upsertTodoById(trashTodosRef, record, true)
    }
  }

  const handleRealtimeActiveState = (record) => {
    removeTodoById(trashTodosRef, record.id)
    upsertTodoById(todosRef, record)
  }

  const handleRealtimeChange = (payload) => {
    const syncQueue = getSyncQueue()
    const { eventType, new: newRecord, old: oldRecord } = payload

    // 检查该ID是否有未同步的本地修改
    const hasLocalChange = syncQueue.queue.some(
      item => item.targetId === (newRecord?.id || oldRecord?.id)
    )

    // 如果本地有未同步的修改，忽略服务器推送 (本地优先策略)
    if (hasLocalChange) {
      console.log('忽略服务器推送，本地有未同步修改')
      return
    }

    // 标记正在接收远程更新（短暂显示同步中状态）
    syncQueue.markRemoteUpdate()

    switch (eventType) {
      case 'INSERT':
        handleRealtimeInsert(newRecord)
        break

      case 'UPDATE':
        if (newRecord.deleted_at !== null) {
          handleRealtimeDeletedState(newRecord)
        } else {
          handleRealtimeActiveState(newRecord)
        }
        break

      case 'DELETE':
        removeTodoById(todosRef, oldRecord.id)
        removeTodoById(trashTodosRef, oldRecord.id)
        break
    }
  }

  const setupRealtimeSubscription = () => {
    const userId = getUserId()
    if (!userId) return

    // 清理之前的订阅
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel)
    }

    realtimeChannel = supabaseClient
      .channel('todos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Realtime 收到变更:', payload.eventType, payload)
          handleRealtimeChange(payload)
        }
      )
      .subscribe((status) => {
        console.log('Realtime 订阅状态:', status)
      })
  }

  const cleanupRealtimeSubscription = () => {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  return {
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
    handleRealtimeChange
  }
}
