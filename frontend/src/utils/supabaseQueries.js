import { supabase } from '@/supabase'

/**
 * 从视图查询所有活跃任务（未删除）
 */
export async function getActiveTodos() {
  const { data, error } = await supabase
    .from('active_todos')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('获取活跃任务失败:', error)
    throw error
  }
  
  return data
}

/**
 * 从视图查询所有叶子任务（没有子任务）
 */
export async function getLeafTodos() {
  const { data, error } = await supabase
    .from('leaf_todos')
    .select('*')
    .order('priority', { ascending: false })
  
  if (error) {
    console.error('获取叶子任务失败:', error)
    throw error
  }
  
  return data
}

/**
 * 从视图查询所有根任务（顶级任务）
 */
export async function getRootTodos() {
  const { data, error } = await supabase
    .from('root_todos')
    .select('*')
    .order('sort_order', { ascending: true })
  
  if (error) {
    console.error('获取根任务失败:', error)
    throw error
  }
  
  return data
}

/**
 * 查询任务树视图（使用递归查询）
 * 注意：需要先在数据库中创建 v_todos_tree 视图
 */
export async function getTodosTree() {
  const { data, error } = await supabase
    .from('v_todos_tree')
    .select('*')
    .order('depth', { ascending: true })
    .order('path', { ascending: true })
  
  if (error) {
    console.error('获取任务树失败:', error)
    throw error
  }
  
  return data
}

/**
 * 查询带有进度的任务视图
 * 返回每个任务的完成进度百分比
 * 注意：需要先在数据库中创建 v_todos_with_progress 视图
 */
export async function getTodosWithProgress() {
  const { data, error } = await supabase
    .from('v_todos_with_progress')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('获取任务进度失败:', error)
    throw error
  }
  
  return data
}

/**
 * 查询特定任务的进度信息
 */
export async function getTodoProgress(todoId) {
  const { data, error } = await supabase
    .from('v_todos_with_progress')
    .select('id, title, status, done_count, total_count, progress_percent')
    .eq('id', todoId)
    .single()
  
  if (error) {
    console.error(`获取任务 ${todoId} 的进度失败:`, error)
    throw error
  }
  
  return data
}

/**
 * 查询活跃且高优先级的任务
 */
export async function getHighPriorityActiveTodos(priority = 3) {
  const { data, error } = await supabase
    .from('active_todos')
    .select('*')
    .gte('priority', priority)
    .neq('status', 'done')
    .order('priority', { ascending: false })
    .order('deadline', { ascending: true })
  
  if (error) {
    console.error('获取高优先级任务失败:', error)
    throw error
  }
  
  return data
}

/**
 * 查询有截止时间的活跃任务（按紧急度排序）
 */
export async function getDeadlineTodos() {
  const { data, error } = await supabase
    .from('active_todos')
    .select('*')
    .not('deadline', 'is', null)
    .neq('status', 'done')
    .order('deadline', { ascending: true })
  
  if (error) {
    console.error('获取有截止时间的任务失败:', error)
    throw error
  }
  
  return data
}

/**
 * 查询特定父任务的所有子任务
 */
export async function getChildTodos(parentId) {
  const { data, error } = await supabase
    .from('active_todos')
    .select('*')
    .eq('parent_id', parentId)
    .order('sort_order', { ascending: true })
  
  if (error) {
    console.error(`获取任务 ${parentId} 的子任务失败:`, error)
    throw error
  }
  
  return data
}

/**
 * 查询根任务及其进度
 */
export async function getRootTodosWithProgress() {
  const { data, error } = await supabase
    .from('v_todos_with_progress')
    .select('id, title, status, priority, progress_percent, done_count, total_count')
    .is('parent_id', null)
    .order('sort_order', { ascending: true })
  
  if (error) {
    console.error('获取根任务进度失败:', error)
    throw error
  }
  
  return data
}

/**
 * 订阅视图数据变化（实时更新）
 */
export function subscribeToActiveTodos(callback) {
  return supabase
    .channel('active_todos_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'todos',
        filter: 'deleted_at=is.null'
      },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()
}

/**
 * 订阅特定任务的进度变化
 */
export function subscribeToTodoProgress(todoId, callback) {
  return supabase
    .channel(`todo_progress_${todoId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'todos',
        filter: `id=eq.${todoId}`
      },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()
}
