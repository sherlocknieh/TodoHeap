// Todo Realtime 管理
export const createTodosRealtimeManager = ({
  supabaseClient,
  getSyncQueue,
  getUserId,
  todosRef,
  trashTodosRef,
  trashLoadingRef,
  setRealtimeStatus
}) => {
  let realtimeChannel = null
  let reconnectTimer = null
  let reconnectAttempts = 0
  let isDisposed = false
  let subscriptionVersion = 0

  const BASE_RETRY_DELAY_MS = 1000
  const MAX_RETRY_DELAY_MS = 30000

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const removeCurrentChannel = () => {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

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

  const scheduleReconnect = (reason = 'UNKNOWN') => {
    if (isDisposed) return

    const userId = getUserId()
    if (!userId) {
      setRealtimeStatus?.('NO_USER')
      return
    }

    clearReconnectTimer()
    const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, reconnectAttempts), MAX_RETRY_DELAY_MS)
    reconnectAttempts += 1
    setRealtimeStatus?.('RECONNECTING')

    reconnectTimer = setTimeout(() => {
      if (isDisposed) return
      console.log(`Realtime 尝试重连，原因: ${reason}, 延迟: ${delay}ms`)
      setupRealtimeSubscription(true)
    }, delay)
  }

  const setupRealtimeSubscription = (isReconnect = false) => {
    const userId = getUserId()
    if (!userId) {
      setRealtimeStatus?.('NO_USER')
      return
    }

    isDisposed = false
    clearReconnectTimer()

    setRealtimeStatus?.(isReconnect ? 'RECONNECTING' : 'CONNECTING')
    subscriptionVersion += 1
    const currentVersion = subscriptionVersion

    // 清理之前的订阅
    removeCurrentChannel()

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
        if (currentVersion !== subscriptionVersion) return
        console.log('Realtime 订阅状态:', status)
        setRealtimeStatus?.(status)

        if (status === 'SUBSCRIBED') {
          reconnectAttempts = 0
          return
        }

        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          scheduleReconnect(status)
        }

        // 某些网络波动会触发 CLOSED，这里仅在非主动清理时尝试重连
        if (status === 'CLOSED' && !isDisposed) {
          scheduleReconnect(status)
        }
      })
  }

  const cleanupRealtimeSubscription = () => {
    isDisposed = true
    clearReconnectTimer()
    reconnectAttempts = 0
    subscriptionVersion += 1
    setRealtimeStatus?.('CLOSED')
    removeCurrentChannel()
  }

  return {
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
    handleRealtimeChange
  }
}
