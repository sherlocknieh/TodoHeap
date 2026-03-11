import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import { supabase } from '@/lib/supabase'
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

  // 统一登录校验
  const requireAuthUser = () => {
    const authStore = useAuthStore()
    if (!authStore.user) {
      return { ok: false, result: { success: false, error: '请先登录' } }
    }
    return { ok: true, user: authStore.user }
  }

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

  // 递归查找给定列表中的所有后代ID
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

  // 根据ID列表收集任务快照
  const collectTodosByIds = (sourceTodos, ids) => {
    if (!ids.length) return []
    return ids
      .map(id => sourceTodos.find(t => t.id === id))
      .filter(Boolean)
      .map(todo => ({ ...todo }))
  }

  // 从列表中批量移除任务
  const removeTodosByIds = (targetRef, idsToRemove) => {
    targetRef.value = targetRef.value.filter(t => !idsToRemove.has(t.id))
  }

  // upsert 到 ref 列表（按 id）
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

  // 根据 id 从 ref 列表中移除
  const removeTodoById = (targetRef, id) => {
    const index = targetRef.value.findIndex(t => t.id === id)
    if (index !== -1) {
      targetRef.value.splice(index, 1)
    }
  }

  // 批量插入（不重复）到列表头部
  const prependUniqueTodos = (targetRef, items) => {
    items.forEach(item => {
      if (!targetRef.value.find(t => t.id === item.id)) {
        targetRef.value.unshift(item)
      }
    })
  }

  // 级联操作上下文：根任务、后代、快照与移除集合
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
      rootIndex,
      rootTodo,
      descendantIds,
      descendantSnapshots,
      idsToRemove
    }
  }

  // 保存父任务与后代快照
  const saveCascadeSnapshots = (syncQueue, rootKey, rootTodo, descendantSnapshots, descendantKey) => {
    syncQueue.saveSnapshot(rootKey, { ...rootTodo })
    if (descendantSnapshots.length > 0) {
      syncQueue.saveSnapshot(descendantKey, descendantSnapshots)
    }
  }

  // 通用树构建器
  const buildTreeNodes = (items, mapItem, sortFn, setNodeMeta) => {
    const nodes = items.map((item) => ({ ...mapItem(item), children: [] }))
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

    if (setNodeMeta) {
      const walk = (arr, depth = 0) => {
        arr.forEach(node => {
          setNodeMeta(node, depth)
          walk(node.children, depth + 1)
        })
      }
      walk(roots, 0)
    }

    const sortTree = (arr) => {
      arr.sort(sortFn)
      arr.forEach((child) => sortTree(child.children))
    }
    sortTree(roots)
    return roots
  }

  // ========== 监听同步事件 ==========
  
  // 处理登出事件：清理所有本地数据
  const handleSignedOut = () => {
    todos.value = []
    trashTodos.value = []
    isFetched.value = false
    error.value = null
  }

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
        // 回滚删除：恢复快照（包含父任务和后代任务）
        if (snapshot) {
          todos.value.push(snapshot)
          // 检查是否有后代任务快照
          const descendantSnapshot = getSyncQueue().getSnapshot(`${item.targetId}-descendants`)
          if (descendantSnapshot && Array.isArray(descendantSnapshot)) {
            todos.value.push(...descendantSnapshot)
            getSyncQueue().clearSnapshot(`${item.targetId}-descendants`)
          }
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
      
      case OperationType.BATCH_PERMANENT_DELETE:
        // 回滚清空垃圾箱：恢复快照
        if (snapshot && Array.isArray(snapshot)) {
          trashTodos.value = snapshot
        }
        error.value = '清空垃圾箱失败，已恢复'
        break
      
      case OperationType.BATCH_RESTORE:
        // 回滚批量恢复：恢复快照
        if (snapshot) {
          trashTodos.value = snapshot.trash || []
          todos.value = snapshot.todos || []
        }
        error.value = '恢复全部任务失败，已恢复'
        break
    }
    
    // 3秒后清除错误
    setTimeout(() => {
      if (error.value?.includes('失败')) {
        error.value = null
      }
    }, 3000)
  }

  let windowListenersBound = false

  const bindWindowListeners = () => {
    if (typeof window === 'undefined' || windowListenersBound) return
    window.addEventListener('auth:signedOut', handleSignedOut)
    window.addEventListener('sync:id-replaced', handleIdReplaced)
    window.addEventListener('sync:update-success', handleUpdateSuccess)
    window.addEventListener('sync:rollback', handleRollback)
    windowListenersBound = true
  }

  const unbindWindowListeners = () => {
    if (typeof window === 'undefined' || !windowListenersBound) return
    window.removeEventListener('auth:signedOut', handleSignedOut)
    window.removeEventListener('sync:id-replaced', handleIdReplaced)
    window.removeEventListener('sync:update-success', handleUpdateSuccess)
    window.removeEventListener('sync:rollback', handleRollback)
    windowListenersBound = false
  }

  // 注册事件监听
  bindWindowListeners()
  onScopeDispose(() => {
    unbindWindowListeners()
  })

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
    const auth = requireAuthUser()
    if (!auth.ok) {
      error.value = '请先登录'
      return auth.result
    }

    const syncQueue = getSyncQueue()
    
    // 1. 生成临时ID
    const tempId = syncQueue.generateTempId()
    
    // 2. 构建新任务数据
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

  // 递归查找所有后代任务ID
  const findDescendantIds = (parentId) => collectDescendantIds(todos.value, parentId)

  // 删除 (乐观更新 - 软删除)
  const deleteTodo = async (id) => {
    const syncQueue = getSyncQueue()
    const realId = syncQueue.getRealId(id)

    // 1. 生成级联上下文
    const context = buildCascadeContext(todos.value, realId, findDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    // 2. 保存快照用于回滚（包含父任务与后代）
    saveCascadeSnapshots(
      syncQueue,
      realId,
      context.rootTodo,
      context.descendantSnapshots,
      `${realId}-descendants`
    )
    
    // 3. 乐观更新：立即从列表移除父任务及所有后代
    removeTodosByIds(todos, context.idsToRemove)
    
    // 4. 乐观更新垃圾箱：将删除的任务添加到垃圾箱
    const deletedAt = new Date().toISOString()
    const deletedTodo = { ...context.rootTodo, deleted_at: deletedAt }
    
    // 检查垃圾箱是否已加载（避免重复添加）
    if (trashTodos.value.length > 0 || !trashLoading.value) {
      // 检查是否已存在
      prependUniqueTodos(trashTodos, [deletedTodo])
      // 同时添加后代任务到垃圾箱
      prependUniqueTodos(
        trashTodos,
        context.descendantSnapshots.map(descTodo => ({ ...descTodo, deleted_at: deletedAt }))
      )
    }
    
    // 5. 如果是临时ID且还未同步，直接从队列移除相关操作
    if (syncQueue.isTempId(id)) {
      // 临时任务还没同步到服务器，不需要发请求
      syncQueue.clearSnapshot(realId)
      syncQueue.clearSnapshot(`${realId}-descendants`)
      return { success: true }
    }
    
    // 6. 将删除操作加入同步队列（数据库触发器会级联删除子任务）
    await syncQueue.enqueue({
      type: OperationType.DELETE,
      targetId: realId,
      payload: { deleted_at: deletedAt }
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

  // 恢复任务 (乐观更新) - 包含后代任务
  const restoreTodo = async (id) => {
    const syncQueue = getSyncQueue()

    // 1. 生成级联上下文
    const context = buildCascadeContext(trashTodos.value, id, findTrashDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    // 2. 保存快照用于回滚（包含父任务与后代）
    saveCascadeSnapshots(syncQueue, id, context.rootTodo, context.descendantSnapshots, `${id}-trash-descendants`)
    
    // 3. 乐观更新：移除父任务及所有后代
    removeTodosByIds(trashTodos, context.idsToRemove)
    
    // 4. 添加到正常列表
    const restoredTodo = { ...context.rootTodo, deleted_at: null }
    todos.value.push(restoredTodo)
    context.descendantSnapshots.forEach(descTodo => {
      todos.value.push({ ...descTodo, deleted_at: null })
    })
    
    // 5. 将恢复操作加入同步队列（数据库触发器会级联恢复子任务）
    await syncQueue.enqueue({
      type: OperationType.RESTORE,
      targetId: id,
      payload: { deleted_at: null }
    })
    
    return { success: true, data: restoredTodo }
  }

  // 永久删除任务 (乐观更新) - 包含后代任务
  const permanentDeleteTodo = async (id) => {
    const syncQueue = getSyncQueue()

    // 1. 生成级联上下文
    const context = buildCascadeContext(trashTodos.value, id, findTrashDescendantIds)
    if (!context) {
      return { success: false, error: '任务不存在' }
    }

    // 2. 保存快照用于回滚（包含父任务与后代）
    saveCascadeSnapshots(syncQueue, id, context.rootTodo, context.descendantSnapshots, `${id}-trash-descendants`)
    
    // 3. 乐观更新：移除父任务及所有后代
    removeTodosByIds(trashTodos, context.idsToRemove)
    
    // 4. 将永久删除操作加入同步队列（数据库级联删除子任务）
    await syncQueue.enqueue({
      type: OperationType.PERMANENT_DELETE,
      targetId: id,
      payload: {}
    })
    
    return { success: true }
  }

  // 清空垃圾箱 (乐观更新)
  const emptyTrash = async () => {
    const auth = requireAuthUser()
    if (!auth.ok) return auth.result

    const syncQueue = getSyncQueue()
    
    // 1. 保存快照用于回滚
    const trashSnapshot = [...trashTodos.value]
    syncQueue.saveSnapshot('batch-empty-trash', trashSnapshot)
    
    // 2. 乐观更新：立即清空垃圾箱
    trashTodos.value = []
    
    // 3. 将批量删除操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.BATCH_PERMANENT_DELETE,
      targetId: 'batch-empty-trash',
      payload: { user_id: auth.user.id }
    })
    
    return { success: true }
  }

  // 恢复所有任务 (乐观更新)
  const restoreAllTrash = async () => {
    const auth = requireAuthUser()
    if (!auth.ok) return auth.result

    const syncQueue = getSyncQueue()
    
    // 1. 保存快照用于回滚
    const trashSnapshot = [...trashTodos.value]
    const todosSnapshot = [...todos.value]
    syncQueue.saveSnapshot('batch-restore-all', { trash: trashSnapshot, todos: todosSnapshot })
    
    // 2. 乐观更新：立即移动所有任务到正常列表
    const restoredTodos = trashTodos.value.map(t => ({ ...t, deleted_at: null }))
    todos.value.push(...restoredTodos)
    trashTodos.value = []
    
    // 3. 将批量恢复操作加入同步队列
    await syncQueue.enqueue({
      type: OperationType.BATCH_RESTORE,
      targetId: 'batch-restore-all',
      payload: { user_id: auth.user.id }
    })
    
    return { success: true }
  }

  // AI 任务分解 - 流式版本
  // autoApply: true = 立即添加任务, false = 仅收集任务数据供确认
  const invokeBreakdown = async (todosTree, selectedNodeId, query, onTaskReceived, autoApply = true) => {
    console.log('开始流式任务分解:', { todosTree, selectedNodeId, query, autoApply })
    
    const body = {
      todosTree: todosTree,
      selectedNodeId: selectedNodeId,
      query: query
    }
    
    // 获取同步队列以获取真实的parent_id
    const syncQueue = getSyncQueue()
    const realParentId = syncQueue.getRealId(selectedNodeId)
    
    // 收集的任务数据（用于非自动应用模式）
    const collectedTasks = []
    
    try {
      // 获取 Supabase 配置
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      //const supabasePubKey = import.meta.env.VITE_SUPABASE_PUB_KEY
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      // 直接使用 fetch 调用边缘函数以支持流式响应
      const response = await fetch(`${supabaseUrl}/functions/v1/breakdown_task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify(body)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('任务分解API调用失败:', errorText)
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }
      
      // 处理 SSE 流式响应
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      let successCount = 0
      let totalCount = 0
      let buffer = ''

      const toBreakdownTask = (taskPayload) => ({
        title: taskPayload.title,
        status: taskPayload.status || 'todo',
        priority: taskPayload.priority ?? 1,
        parent_id: realParentId,
        deadline: taskPayload.deadline || null
      })

      const emitReceivedTask = (task, index) => {
        if (onTaskReceived) {
          onTaskReceived({
            task,
            index,
            totalSoFar: totalCount
          })
        }
      }
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('流式响应结束')
          break
        }
        
        // 解码并处理数据
        buffer += decoder.decode(value, { stream: true })
        
        // 按行处理 SSE 数据
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue
            
            try {
              const event = JSON.parse(jsonStr)
              
              if (event.type === 'task') {
                totalCount++
                console.log(`收到子任务 ${event.index}:`, event.data)

                const taskData = toBreakdownTask(event.data)
                
                if (autoApply) {
                  // 立即添加任务
                  const result = await addTodo(taskData.title, {
                    status: taskData.status,
                    priority: taskData.priority,
                    parent_id: taskData.parent_id,
                    deadline: taskData.deadline
                  })
                  
                  if (result.success) {
                    successCount++
                    // 回调通知前端
                    emitReceivedTask(result.data, event.index)
                  }
                } else {
                  // 仅收集任务数据，不实际添加
                  collectedTasks.push({
                    ...taskData,
                    // 生成临时ID用于UI显示
                    id: `preview-${Date.now()}-${event.index}`
                  })
                  successCount++
                  // 回调通知前端
                  emitReceivedTask(collectedTasks[collectedTasks.length - 1], event.index)
                }
              } else if (event.type === 'done') {
                console.log(`任务分解完成，共 ${event.totalCount} 个子任务`)
              } else if (event.type === 'error') {
                console.error('AI分解错误:', event.message)
                return { success: false, error: event.message }
              }
            } catch (parseError) {
              console.warn('解析SSE数据失败:', jsonStr, parseError)
            }
          }
        }
      }
      
      console.log(`${autoApply ? '成功添加' : '收集'} ${successCount}/${totalCount} 个子任务`)
      
      return {
        success: successCount > 0,
        addedCount: successCount,
        totalCount: totalCount,
        // 返回收集的任务数据（用于确认后批量添加）
        pendingTasks: autoApply ? [] : collectedTasks
      }
    } catch (error) {
      console.error('流式任务分解失败:', error)
      return { success: false, error: error.message }
    }
  }
  
  // 批量添加待确认的任务
  const applyPendingTasks = async (pendingTasks) => {
    console.log('批量添加待确认任务:', pendingTasks.length)
    
    let successCount = 0
    const results = []
    
    for (const task of pendingTasks) {
      const result = await addTodo(task.title, {
        status: task.status,
        priority: task.priority,
        parent_id: task.parent_id,
        deadline: task.deadline
      })
      
      if (result.success) {
        successCount++
        results.push(result.data)
      }
    }
    
    console.log(`成功添加 ${successCount}/${pendingTasks.length} 个任务`)
    
    return {
      success: successCount > 0,
      addedCount: successCount,
      totalCount: pendingTasks.length,
      tasks: results
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
          console.log('Realtime 收到变更:', payload.eventType, payload)
          handleRealtimeChange(payload)
        }
      )
      .subscribe((status) => {
        console.log('Realtime 订阅状态:', status)
      })
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

    const shouldMaintainTrash = () => trashTodos.value.length > 0 || trashLoading.value === false

    const handleRealtimeInsert = (record) => {
      if (record.deleted_at === null) {
        upsertTodoById(todos, record)
      }
    }

    const handleRealtimeDeletedState = (record) => {
      removeTodoById(todos, record.id)
      if (shouldMaintainTrash()) {
        upsertTodoById(trashTodos, record, true)
      }
    }

    const handleRealtimeActiveState = (record) => {
      removeTodoById(trashTodos, record.id)
      upsertTodoById(todos, record)
    }

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
        // 永久删除
        removeTodoById(todos, oldRecord.id)
        removeTodoById(trashTodos, oldRecord.id)
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

    return buildTreeNodes(
      todos.value,
      (item) => ({
        id: item.id,
        title: item.title,
        status: item.status || 'todo',
        priority: item.priority ?? 0,
        parent_id: item.parent_id,
        deadline: item.deadline || null,
        // 标记是否是临时ID (用于UI显示同步状态)
        _isSyncing: syncQueue.isTempId(item.id)
      }),
      sortFn
    )
  })

  // Getters - 垃圾箱树形结构
  const trashTreeNodes = computed(() => {
    // 排序：删除时间降序，然后按ID排序
    const sortFn = (a, b) => {
      // 先按删除时间降序
      const aTime = new Date(a.deleted_at || 0).getTime()
      const bTime = new Date(b.deleted_at || 0).getTime()
      if (aTime !== bTime) return bTime - aTime
      // 同时间按ID排序
      return a.id - b.id
    }

    return buildTreeNodes(
      trashTodos.value,
      (item) => ({
        id: item.id,
        title: item.title,
        status: item.status || 'todo',
        priority: item.priority ?? 0,
        parent_id: item.parent_id,
        deadline: item.deadline || null,
        deleted_at: item.deleted_at,
        // 标记层级深度
        _depth: 0
      }),
      sortFn,
      (node, depth) => {
        node._depth = depth
      }
    )
  })

  // 检查任务是否可以直接恢复（父任务不在垃圾箱中）
  const canRestoreTodo = (id) => {
    const todo = trashTodos.value.find(t => t.id === id)
    if (!todo) return { canRestore: false, reason: '任务不存在' }
    
    // 如果没有父任务，可以直接恢复
    if (!todo.parent_id) {
      return { canRestore: true }
    }
    
    // 检查父任务是否也在垃圾箱中
    const parentInTrash = trashTodos.value.find(t => t.id === todo.parent_id)
    if (parentInTrash) {
      return {
        canRestore: false,
        reason: '请先恢复父任务',
        parentId: parentInTrash.id,
        parentTitle: parentInTrash.title
      }
    }
    
    // 父任务不在垃圾箱中（可能已恢复或不存在），可以恢复
    return { canRestore: true }
  }

  // 递归查找垃圾箱中所有后代任务ID
  const findTrashDescendantIds = (parentId) => collectDescendantIds(trashTodos.value, parentId)

  // 统计将要恢复的任务数量（包括后代）
  const countRestoreTodos = (id) => {
    const descendantIds = findTrashDescendantIds(id)
    return 1 + descendantIds.length
  }

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
    trashTreeNodes,
    columns,
    // 方法
    fetchTodos,
    addTodo,
    updateTodo,
    toggleDone,
    deleteTodo,
    clearError,
    invokeBreakdown,
    applyPendingTasks,
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
    findTodoIndexById,
    // 垃圾箱辅助方法
    canRestoreTodo,
    findTrashDescendantIds,
    countRestoreTodos
  }
})
