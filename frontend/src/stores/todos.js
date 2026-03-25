import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import { supabase } from '@/lib/supabase'

import { useAuthStore } from './auth'

import { useSyncQueueStore, OperationType } from './syncQueue'
import { createBreakdownActions } from './todos.breakdown'
import { createTodosRealtimeManager } from './todos.realtime'
import { createTodoOptimisticActions } from './todos.optimistic'
import { createTodoRollbackHandler } from './todos.rollback'


export const useTodoStore = defineStore('todos', () => {
  // 状态
  const todos = ref([])
  const loading = ref(false)
  const error = ref(null)
  const isFetched = ref(false)  // 记录是否已经成功获取过一次数据
  const trashTodos = ref([])
  const trashLoading = ref(false)

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

  const {
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
  } = createTodoOptimisticActions({
    todosRef: todos,
    trashTodosRef: trashTodos,
    trashLoadingRef: trashLoading,
    getSyncQueue,
    requireAuthUser,
    setError: (message) => {
      error.value = message
    },
    OperationType
  })

  const { handleRollback } = createTodoRollbackHandler({
    todosRef: todos,
    trashTodosRef: trashTodos,
    errorRef: error,
    getSyncQueue,
    findTodoIndexById,
    OperationType
  })

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

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  // ========== 垃圾箱功能 ==========

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


  const { invokeBreakdown, applyPendingTasks } = createBreakdownActions({
    getSyncQueue,
    addTodo
  })

  const { setupRealtimeSubscription, cleanupRealtimeSubscription } = createTodosRealtimeManager({
    supabaseClient: supabase,
    getSyncQueue,
    getUserId: () => useAuthStore().user?.id,
    todosRef: todos,
    trashTodosRef: trashTodos,
    trashLoadingRef: trashLoading
  })

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
