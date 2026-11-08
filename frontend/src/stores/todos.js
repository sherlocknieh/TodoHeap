import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import { supabase } from '@/lib/supabase'

import { useAuthStore } from './auth'

import { useSyncQueueStore, OperationType } from './syncQueue'
import { createTodosRealtimeManager } from './todos.realtime'
import { createTodoOptimisticActions } from './todos.optimistic'
import { createTodoRollbackHandler } from './todos.rollback'
import { buildTaskForest } from '@/utils/taskGraph'


export const useTodoStore = defineStore('todos', () => {
  // 状态
  const todos = ref([])
  const loading = ref(false)
  const error = ref(null)
  const isFetched = ref(false)  // 记录是否已经成功获取过一次数据
  const trashTodos = ref([])
  const trashLoading = ref(false)
  const isTrashFetched = ref(false)  // 记录回收站是否已经成功获取过一次数据
  const realtimeStatus = ref('IDLE')

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

  const todoTitleCollator = new Intl.Collator('zh-Hans-CN', {
    sensitivity: 'base',
    numeric: true
  })

  const compareTodos = (a, b) => {
    const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : Number.POSITIVE_INFINITY
    const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder

    const titleDiff = todoTitleCollator.compare(String(a.title || ''), String(b.title || ''))
    if (titleDiff !== 0) return titleDiff

    const aIsTemp = a.id < 0
    const bIsTemp = b.id < 0
    if (aIsTemp && !bIsTemp) return 1
    if (!aIsTemp && bIsTemp) return -1

    const aCreatedAt = new Date(a.created_at || 0).getTime()
    const bCreatedAt = new Date(b.created_at || 0).getTime()
    if (aCreatedAt !== bCreatedAt) return aCreatedAt - bCreatedAt

    return a.id - b.id
  }

  const {
    findTodoById,
    findTodoIndexById,
    addTodo,
    updateTodo,
    toggleDone,
    moveTodo,
    deleteTodo,
    deleteCompletedTodos,
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
    compareTodos,
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

  // ========== 监听同步事件 ==========
  
  // 处理登出事件：清理所有本地数据
  const handleSignedOut = () => {
    todos.value = []
    trashTodos.value = []
    isFetched.value = false
    isTrashFetched.value = false
    error.value = null
    realtimeStatus.value = 'NO_USER'
  }

  // ID替换事件处理 (临时ID -> 真实ID)
  const handleIdReplaced = (event) => {
    const { tempId, realId, data } = event.detail

    // 子列表中引用的临时ID也要替换, 否则父节点会指向已消失的本地ID
    todos.value.forEach((todo) => {
      if (Array.isArray(todo.child_ids)) {
        todo.child_ids = todo.child_ids.map((id) => (id === tempId ? realId : id))
      }
    })

    const index = todos.value.findIndex(t => t.id === tempId)
    if (index !== -1) {
      const localChildIds = todos.value[index].child_ids || []
      // 服务器刚创建的任务还没有子节点, 合并本地已挂上的子任务
      todos.value[index] = {
        ...data,
        child_ids: [...new Set([...(data.child_ids || []), ...localChildIds])]
      }
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
        .order('created_at', { ascending: true })
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
    try {
      const { data, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

      if (fetchError) throw fetchError
      trashTodos.value = data || []
      isTrashFetched.value = true
      return { success: true }
    } catch (err) {
      // 回收站没有独立的错误展示区, 失败信息随返回值交给调用方, 不污染列表的全局错误
      console.error('Fetch trash error:', err)
      return { success: false, error: err.message }
    } finally {
      trashLoading.value = false
    }
  }

  // 首次进入回收站前拉取; 已拉取过则直接复用缓存, 后续变化由乐观更新与 Realtime 维护
  const ensureTrashFetched = async () => {
    if (isTrashFetched.value) return { success: true }
    return fetchTrash()
  }


  const { setupRealtimeSubscription, cleanupRealtimeSubscription } = createTodosRealtimeManager({
    supabaseClient: supabase,
    getSyncQueue,
    getUserId: () => useAuthStore().user?.id,
    todosRef: todos,
    trashTodosRef: trashTodos,
    isTrashFetchedRef: isTrashFetched,
    setRealtimeStatus: (status) => {
      realtimeStatus.value = status || 'UNKNOWN'
    }
  })

  // 已同步的父节点不会知道本地尚未同步的子任务, 渲染前补上这些临时引用
  const withLocalChildLinks = (items) => {
    const syncQueue = getSyncQueue()
    const pendingLinks = items.filter((item) => item.parent_id != null && syncQueue.isTempId(item.id))
    if (pendingLinks.length === 0) return items

    return items.map((item) => {
      const pendingChildIds = pendingLinks
        .filter((child) => child.parent_id === item.id)
        .map((child) => child.id)
      if (pendingChildIds.length === 0) return item
      return {
        ...item,
        child_ids: [...new Set([...(item.child_ids || []), ...pendingChildIds])]
      }
    })
  }

  // Getters - 树形结构
  const treeNodes = computed(() => {
    const syncQueue = getSyncQueue()

    return buildTaskForest(withLocalChildLinks(todos.value), {
      mapItem: (item) => ({
        id: item.id,
        title: item.title,
        details: item.details || '',
        completed_at: item.completed_at || null,
        deadline: item.deadline || null,
        sort_order: Number.isFinite(item.sort_order) ? item.sort_order : null,
        difficulty: item.difficulty ?? null,
        created_at: item.created_at || null,
        // 标记是否是临时ID (用于UI显示同步状态)
        _isSyncing: syncQueue.isTempId(item.id)
      }),
      sortFn: compareTodos
    })
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

    return buildTaskForest(trashTodos.value, {
      mapItem: (item) => ({
        id: item.id,
        title: item.title,
        details: item.details || '',
        completed_at: item.completed_at || null,
        deadline: item.deadline || null,
        sort_order: Number.isFinite(item.sort_order) ? item.sort_order : null,
        difficulty: item.difficulty ?? null,
        deleted_at: item.deleted_at,
        // 标记层级深度
        _depth: 0
      }),
      sortFn,
      setNodeMeta: (node, depth) => {
        node._depth = depth
      }
    })
  })

  return {
    // 状态
    todos,
    loading,
    error,
    isFetched,
    realtimeStatus,
    // 垃圾箱状态
    trashTodos,
    trashLoading,
    isTrashFetched,
    // 计算属性
    treeNodes,
    trashTreeNodes,
    // 方法
    fetchTodos,
    addTodo,
    updateTodo,
    toggleDone,
    moveTodo,
    deleteTodo,
    deleteCompletedTodos,
    clearError,
    // 垃圾箱方法
    fetchTrash,
    ensureTrashFetched,
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
