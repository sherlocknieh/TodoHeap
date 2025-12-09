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
        .neq('status', 'deleted')
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
          status: 'deleted', 
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


  const invokeHello = async () => {
    
    const { data, error } = await supabase.functions.invoke('hello',{'body':{name:'TodoHeap'}})

    console.log(data,error)
  }  

  const invokeBreakdown = async () => {
    const body = {
      todo:'学习线性代数',
      query:'分解'
    }

    const { data, error } = await supabase.functions.invoke('breakdown_task',{'body':body})
    console.log(data,error)
  }



  // Getters - 树形结构
  const treeNodes = computed(() => {
    const nodes = todos.value.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status || 'todo',
      priority: item.priority ?? 0,
      parent_id: item.parent_id,
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
    invokeHello,
    invokeBreakdown
  }
})