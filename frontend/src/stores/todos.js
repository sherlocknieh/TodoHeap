import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../supabase'
import { useAuthStore } from './auth'

export const useTodoStore = defineStore('todos', () => {
  // 状态
  const todos = ref([])
  const loading = ref(false)
  const error = ref(null)
  const isFetched = ref(false)  // 记录是否已经成功获取过一次数据

  // 获取待办事项列表
  const fetchTodos = async () => {
    // 如果已经在加载中，不重复请求
    if (loading.value) return { success: true }
    
    loading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        // .neq('status', 'deleted')
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('id', { ascending: true })

      if (fetchError) throw fetchError
      todos.value = data || []
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

  // 添加待办事项
  const addTodo = async (title, options = {}) => {
    const authStore = useAuthStore()
    if (!authStore.user) {
      error.value = '请先登录'
      return { success: false, error: '请先登录' }
    }

    loading.value = true
    error.value = null
    try {
      const { data, error: addError } = await supabase
        .from('todos')
        .insert({
          title: title.trim(),
          user_id: authStore.user.id,
          status: options.status || 'todo',
          priority: options.priority ?? 0,
          parent_id: options.parent_id || null,
          deadline: options.deadline || null
        })
        .select()
        .single()

      if (addError) throw addError
      todos.value.push(data)
      return { success: true, data }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 更新待办事项
  const updateTodo = async (id, updates) => {
    loading.value = true
    error.value = null
    try {
      const { data, error: updateError } = await supabase
        .from('todos')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      
      const index = todos.value.findIndex(t => t.id === id)
      if (index !== -1) {
        todos.value[index] = data
      }
      return { success: true, data }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 切换完成状态
  const toggleDone = async (id) => {
    const todo = todos.value.find(t => t.id === id)
    if (!todo) return { success: false, error: '任务不存在' }

    const nextStatus = todo.status === 'done' ? 'todo' : 'done'
    return await updateTodo(id, { status: nextStatus })
  }

  // 删除待办事项（软删除）
  const deleteTodo = async (id) => {
    loading.value = true
    error.value = null
    try {
      const { error: deleteError } = await supabase
        .from('todos')
        .update({ 
          // status: 'deleted', 
          deleted_at: new Date().toISOString() 
        })
        .eq('id', id)

      if (deleteError) throw deleteError
      
      todos.value = todos.value.filter(t => t.id !== id)
      return { success: true }
    } catch (err) {
      error.value = err.message
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
  
  // 垃圾箱任务列表
  const trashTodos = ref([])
  const trashLoading = ref(false)

  // 获取垃圾箱中的任务（deleted_at 不为 null）
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

  // 恢复任务（将 deleted_at 设为 null）
  const restoreTodo = async (id) => {
    loading.value = true
    error.value = null
    try {
      const { data, error: restoreError } = await supabase
        .from('todos')
        .update({ deleted_at: null })
        .eq('id', id)
        .select()
        .single()

      if (restoreError) throw restoreError
      
      // 从垃圾箱列表移除
      trashTodos.value = trashTodos.value.filter(t => t.id !== id)
      // 添加到正常列表
      todos.value.push(data)
      
      return { success: true, data }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 永久删除任务
  const permanentDeleteTodo = async (id) => {
    loading.value = true
    error.value = null
    try {
      const { error: deleteError } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      
      // 从垃圾箱列表移除
      trashTodos.value = trashTodos.value.filter(t => t.id !== id)
      
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 清空垃圾箱（永久删除所有）
  const emptyTrash = async () => {
    loading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      if (!authStore.user) {
        throw new Error('请先登录')
      }

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

  // 恢复所有任务
  const restoreAllTrash = async () => {
    loading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      if (!authStore.user) {
        throw new Error('请先登录')
      }

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
    
    // 为每个子任务创建数据库记录
    const results = await Promise.all(
      children.map(childTask =>
        addTodo(childTask.title, {
          status: childTask.status || 'todo',
          priority: childTask.priority ?? 1,
          parent_id: selectedNodeId,
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



  // Getters - 树形结构
  const treeNodes = computed(() => {
    const nodes = todos.value.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status || 'todo',
      priority: item.priority ?? 0,
      parent_id: item.parent_id,
      deadline: item.deadline || null,
      children: []
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

    const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
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

    const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
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
    restoreAllTrash
  }
})