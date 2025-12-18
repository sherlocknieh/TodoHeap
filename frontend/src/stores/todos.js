import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../libs/supabase'
import { useAuthStore } from './auth'
import { useSyncQueueStore, OperationType } from './syncQueue'

export const useTodoStore = defineStore('todos', () => {
  // 状态
  const todos = ref([])
  const loading = ref(false)
  const error = ref(null)
  const isFetched = ref(false)  // 记录是否已经成功获取过一次数据

  // 获取同步队列 store
  const getSyncQueue = () => useSyncQueueStore()

  // ========== 乐观更新辅助函数 ==========

  // 根据ID查找todo (支持临时ID映射)
  const findTodoById = (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    return todos.value.find(t => t.id === id || t.id === realId)
  }

  // 根据ID查找todo索引
  const findTodoIndexById = (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    return todos.value.findIndex(t => t.id === id || t.id === realId)
  }

  // ========== 监听同步事件 ==========
  
  // ID替换事件处理 (临时ID -> 真实ID)
  const handleIdReplaced = (event) => {
    const { tempId, realId, data } = event.detail
    const index = todos.value.findIndex(t => t.id === tempId)
    if (index !== -1) {
      // 更新为服务器返回的完整数据
      todos.value[index] = data
    }
  }

  // 更新成功事件处理
  const handleUpdateSuccess = (event) => {
    const { id, data } = event.detail
    const index = findTodoIndexById(id)
    if (index !== -1) {
      // 使用服务器返回的数据更新本地
      todos.value[index] = data
    }
  }

  // 回滚事件处理
  const handleRollback = (event) => {
    const { item, snapshot } = event.detail
    
    switch (item.type) {
      case OperationType.ADD:
        // 回滚添加：移除该项
        todos.value = todos.value.filter(t => t.id !== item.targetId)
        error.value = `添加任务失败: ${item.payload?.title || '未知'}`
        break
      
      case OperationType.UPDATE:
        // 回滚更新：恢复快照
        if (snapshot) {
          const index = findTodoIndexById(item.targetId)
          if (index !== -1) {
            todos.value[index] = snapshot
          }
        }
        error.value = '更新任务失败，已恢复'
        break
      
      case OperationType.DELETE:
        // 回滚删除：恢复快照
        if (snapshot) {
          todos.value.push(snapshot)
        }
        error.value = '删除任务失败，已恢复'
        break
      
      case OperationType.RESTORE:
        // 回滚恢复：移回垃圾箱
        if (snapshot) {
          const index = findTodoIndexById(item.targetId)
          if (index !== -1) {
            todos.value.splice(index, 1)
          }
          trashTodos.value.push(snapshot)
        }
        error.value = '恢复任务失败'
        break
    }
    
    // 3秒后清除错误
    setTimeout(() => {
      if (error.value?.includes('失败')) {
        error.value = null
      }
    }, 3000)
  }

  // 注册事件监听
  if (typeof window !== 'undefined') {
    window.addEventListener('sync:id-replaced', handleIdReplaced)
    window.addEventListener('sync:update-success', handleUpdateSuccess)
    window.addEventListener('sync:rollback', handleRollback)
  }

  // 获取所有未被删除 Todo (从服务器)
  const fetchTodos = async () => {
    // 如果已经在加载中，不重复请求
    if (loading.value) return { success: true }
    
    loading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('id', { ascending: true })

      if (fetchError) throw fetchError
      
      // 合并服务器数据与本地未同步的数据
      const syncQueue = getSyncQueue()
      const serverTodos = data || []
      
      // 保留本地临时ID的todo (还未同步到服务器的)
      const localTempTodos = todos.value.filter(t => syncQueue.isTempId(t.id))
      
      // 合并数据
      todos.value = [...serverTodos, ...localTempTodos]
      isFetched.value = true
      
      return { success: true }
    } catch (err) {
      error.value = err.message
      console.error('Fetch todos error:', err)
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 添加 (乐观更新)
  const addTodo = async (title, options = {}) => {
    const authStore = useAuthStore()
    if (!authStore.user) {
      error.value = '请先登录'
      return { success: false, error: '请先登录' }
    }

    const syncQueue = getSyncQueue()
    
    // 1. 生成临时ID
    const tempId = syncQueue.generateTempId()
    
    // 2. 构建新任务数据
    const newTodo = {
      id: tempId,
      title: title.trim(),
      user_id: authStore.user.id,
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
    
    // 3. 乐观更新：立即添加到本地
    todos.value.push(newTodo)
    
    // 4. 将操作加入同步队列
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

  // 删除 (乐观更新 - 软删除)
  const deleteTodo = async (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    
    // 1. 找到要删除的todo
    const index = findTodoIndexById(id)
    if (index === -1) {
      return { success: false, error: '任务不存在' }
    }
    
    // 2. 保存快照用于回滚
    const todoToDelete = todos.value[index]
    syncQueue.saveSnapshot(realId, todoToDelete)
    
    // 3. 乐观更新：立即从列表移除
    todos.value.splice(index, 1)
    
    // 4. 如果是临时ID且还未同步，直接从队列移除相关操作
    if (syncQueue.isTempId(id)) {
      // 临时任务还没同步到服务器，不需要发请求
      syncQueue.clearSnapshot(realId)
      return { success: true }
    }
    
    // 5. 将删除操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.DELETE,
      targetId: realId,
      payload: { deleted_at: new Date().toISOString() }
    })
    
    return { success: true }
  }

  // 修改 (乐观更新)
  const updateTodo = async (id, updates) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)
    
    // 1. 找到要更新的todo
    const index = findTodoIndexById(id)
    if (index === -1) {
      return { success: false, error: '任务不存在' }
    }
    
    // 2. 保存快照用于回滚
    const originalTodo = todos.value[index]
    syncQueue.saveSnapshot(realId, { ...originalTodo })
    
    // 3. 乐观更新：立即更新本地数据
    todos.value[index] = {
      ...originalTodo,
      ...updates,
      updated_at: new Date().toISOString()
    }
    
    // 4. 如果是临时ID，更新队列中的ADD操作的payload
    if (syncQueue.isTempId(id)) {
      const queueItem = syncQueue.queue.find(
        item => item.type === OperationType.ADD && item.targetId === id
      )
      if (queueItem) {
        Object.assign(queueItem.payload, updates)
        await syncQueue.persistQueue()
        return { success: true, data: todos.value[index] }
      }
    }
    
    // 5. 将更新操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.UPDATE,
      targetId: realId,
      payload: updates
    })
    
    return { success: true, data: todos.value[index] }
  }

  // 切换状态 (乐观更新)
  const toggleDone = async (id) => {
    const todo = findTodoById(id)
    if (!todo) return { success: false, error: '任务不存在' }

    const nextStatus = todo.status === 'done' ? 'todo' : 'done'
    return await updateTodo(id, { status: nextStatus })
  }

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  // ========== 垃圾箱功能 ==========
  
  // 垃圾箱任务列表
  const trashTodos = ref([])
  const trashLoading = ref(false)

  // 获取已删除的 Todo
  const fetchTrash = async () => {
    if (trashLoading.value) return { success: true }
    
    trashLoading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

      if (fetchError) throw fetchError
      trashTodos.value = data || []
      return { success: true }
    } catch (err) {
      error.value = err.message
      console.error('Fetch trash error:', err)
      return { success: false, error: err.message }
    } finally {
      trashLoading.value = false
    }
  }

  // 恢复任务 (乐观更新)
  const restoreTodo = async (id) => {
    const syncQueue = getSyncQueue()
    
    // 1. 找到要恢复的todo
    const index = trashTodos.value.findIndex(t => t.id === id)
    if (index === -1) {
      return { success: false, error: '任务不存在' }
    }
    
    // 2. 保存快照用于回滚
    const todoToRestore = trashTodos.value[index]
    syncQueue.saveSnapshot(id, { ...todoToRestore })
    
    // 3. 乐观更新
    trashTodos.value.splice(index, 1)
    const restoredTodo = { ...todoToRestore, deleted_at: null }
    todos.value.push(restoredTodo)
    
    // 4. 将恢复操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.RESTORE,
      targetId: id,
      payload: { deleted_at: null }
    })
    
    return { success: true, data: restoredTodo }
  }

  // 永久删除任务 (乐观更新)
  const permanentDeleteTodo = async (id) => {
    const syncQueue = getSyncQueue()
    
    // 1. 找到要删除的todo
    const index = trashTodos.value.findIndex(t => t.id === id)
    if (index === -1) {
      return { success: false, error: '任务不存在' }
    }
    
    // 2. 保存快照用于回滚
    const todoToDelete = trashTodos.value[index]
    syncQueue.saveSnapshot(id, todoToDelete)
    
    // 3. 乐观更新
    trashTodos.value.splice(index, 1)
    
    // 4. 将永久删除操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.PERMANENT_DELETE,
      targetId: id,
      payload: {}
    })
    
    return { success: true }
  }

  // 清空垃圾箱 (批量操作，保持同步)
  const emptyTrash = async () => {
    const authStore = useAuthStore()
    if (!authStore.user) {
      return { success: false, error: '请先登录' }
    }

    // 对于批量操作，我们保持同步方式以确保一致性
    loading.value = true
    error.value = null
    try {
      const { error: deleteError } = await supabase
        .from('todos')
        .delete()
        .eq('user_id', authStore.user.id)
        .not('deleted_at', 'is', null)

      if (deleteError) throw deleteError
      
      trashTodos.value = []
      
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 恢复所有任务 (批量操作，保持同步)
  const restoreAllTrash = async () => {
    const authStore = useAuthStore()
    if (!authStore.user) {
      return { success: false, error: '请先登录' }
    }

    loading.value = true
    error.value = null
    try {
      const { data, error: restoreError } = await supabase
        .from('todos')
        .update({ deleted_at: null })
        .eq('user_id', authStore.user.id)
        .not('deleted_at', 'is', null)
        .select()

      if (restoreError) throw restoreError
      
      // 添加到正常列表
      if (data) {
        todos.value.push(...data)
      }
      trashTodos.value = []
      
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // AI 任务分解
  const invokeBreakdown = async (todosTree, selectedNodeId, query) => {
    console.log('开始任务分解:', {todosTree, selectedNodeId, query })
    
    const body = {
      todosTree: todosTree,
      selectedNodeId: selectedNodeId,
      query: query
    }
    
    const { data, error } = await supabase.functions.invoke('breakdown_task', {'body': body})
    
    if (error) {
      console.error('任务分解API调用失败:', error)
      return { success: false, error: error.message }
    }
    
    console.log('任务分解API返回:', data)
    console.log('返回数据类型:', typeof data)
    
    // 处理可能的字符串格式数据
    let parsedData = data
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data)
        console.log('解析后的数据:', parsedData)
      } catch (parseError) {
        console.error('JSON解析失败:', parseError)
        return { success: false, error: '返回的数据格式不正确' }
      }
    }
    
    // 确保获取到children数组
    const children = parsedData?.children || []
    console.log(`获取到 ${children.length} 个子任务`)
    
    // 获取同步队列以获取真实的parent_id
    const syncQueue = getSyncQueue()
    const realParentId = syncQueue.getRealId(selectedNodeId)
    
    // 为每个子任务创建数据库记录
    const results = await Promise.all(
      children.map(childTask =>
        addTodo(childTask.title, {
          status: childTask.status || 'todo',
          priority: childTask.priority ?? 1,
          parent_id: realParentId,
          deadline: childTask.deadline || null
        })
      )
    )
    
    const successCount = results.filter(r => r.success).length
    console.log(`成功添加 ${successCount}/${children.length} 个子任务`)
    
    return {
      success: successCount === children.length,
      addedCount: successCount,
      totalCount: children.length
    }
  }

  // ========== Supabase Realtime 订阅 ==========
  
  let realtimeChannel = null

  const setupRealtimeSubscription = () => {
    const authStore = useAuthStore()
    if (!authStore.user) return

    // 清理之前的订阅
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
    }

    realtimeChannel = supabase
      .channel('todos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
          filter: `user_id=eq.${authStore.user.id}`
        },
        (payload) => {
          handleRealtimeChange(payload)
        }
      )
      .subscribe()
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

    switch (eventType) {
      case 'INSERT':
        // 检查是否已存在 (避免重复)
        if (!todos.value.find(t => t.id === newRecord.id)) {
          if (newRecord.deleted_at === null) {
            todos.value.push(newRecord)
          }
        }
        break

      case 'UPDATE':
        if (newRecord.deleted_at !== null) {
          // 变成已删除状态，从todos移到trash
          const index = todos.value.findIndex(t => t.id === newRecord.id)
          if (index !== -1) {
            todos.value.splice(index, 1)
            // 如果垃圾箱已加载，添加到垃圾箱
            if (trashTodos.value.length > 0 || trashLoading.value === false) {
              trashTodos.value.unshift(newRecord)
            }
          }
        } else {
          // 正常更新
          const index = todos.value.findIndex(t => t.id === newRecord.id)
          if (index !== -1) {
            todos.value[index] = newRecord
          } else {
            // 可能是从垃圾箱恢复的
            const trashIndex = trashTodos.value.findIndex(t => t.id === newRecord.id)
            if (trashIndex !== -1) {
              trashTodos.value.splice(trashIndex, 1)
            }
            todos.value.push(newRecord)
          }
        }
        break

      case 'DELETE':
        // 永久删除
        todos.value = todos.value.filter(t => t.id !== oldRecord.id)
        trashTodos.value = trashTodos.value.filter(t => t.id !== oldRecord.id)
        break
    }
  }

  const cleanupRealtimeSubscription = () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // Getters - 树形结构
  const treeNodes = computed(() => {
    const syncQueue = getSyncQueue()
    
    const nodes = todos.value.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status || 'todo',
      priority: item.priority ?? 0,
      parent_id: item.parent_id,
      deadline: item.deadline || null,
      children: [],
      // 标记是否是临时ID (用于UI显示同步状态)
      _isSyncing: syncQueue.isTempId(item.id)
    }))

    const map = new Map()
    nodes.forEach((n) => map.set(n.id, n))

    const roots = []
    nodes.forEach((n) => {
      if (n.parent_id && map.has(n.parent_id)) {
        map.get(n.parent_id).children.push(n)
      } else {
        roots.push(n)
      }
    })

    // 排序：优先级降序，然后按ID排序（临时ID负数排在末尾）
    const sortFn = (a, b) => {
      // 先按优先级降序
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0)
      if (priorityDiff !== 0) return priorityDiff
      // 临时ID（负数）排在最后
      const aIsTemp = a.id < 0
      const bIsTemp = b.id < 0
      if (aIsTemp && !bIsTemp) return 1
      if (!aIsTemp && bIsTemp) return -1
      // 同类型按ID排序
      return a.id - b.id
    }
    const sortTree = (arr) => {
      arr.sort(sortFn)
      arr.forEach((child) => sortTree(child.children))
    }
    sortTree(roots)
    return roots
  })

  // Getters - 堆视图分组
  const columns = computed(() => {
    const grouped = { todo: [], doing: [], done: [] }
    todos.value.forEach((item) => {
      const status = item.status === 'doing' ? 'doing' : item.status === 'done' ? 'done' : 'todo'
      grouped[status].push(item)
    })

    // 排序：优先级降序，临时ID排在末尾
    const sortFn = (a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0)
      if (priorityDiff !== 0) return priorityDiff
      const aIsTemp = a.id < 0
      const bIsTemp = b.id < 0
      if (aIsTemp && !bIsTemp) return 1
      if (!aIsTemp && bIsTemp) return -1
      return a.id - b.id
    }
    Object.values(grouped).forEach((arr) => arr.sort(sortFn))
    return grouped
  })

  return {
    // 状态
    todos,
    loading,
    error,
    isFetched,
    // 垃圾箱状态
    trashTodos,
    trashLoading,
    // 计算属性
    treeNodes,
    columns,
    // 方法
    fetchTodos,
    addTodo,
    updateTodo,
    toggleDone,
    deleteTodo,
    clearError,
    invokeBreakdown,
    // 垃圾箱方法
    fetchTrash,
    restoreTodo,
    permanentDeleteTodo,
    emptyTrash,
    restoreAllTrash,
    // Realtime
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
    // 辅助方法
    findTodoById,
    findTodoIndexById
  }
})
