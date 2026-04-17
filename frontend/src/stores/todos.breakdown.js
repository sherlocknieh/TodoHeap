// AI 任务分解相关动作
import { supabase } from '@/lib/supabase'

export const createBreakdownActions = ({ getSyncQueue, addTodo }) => {
  // AI 任务分解 - 流式版本
  // autoApply: true = 立即添加任务, false = 仅收集任务数据供确认
  const invokeBreakdown = async (todosTree, selectedNodeId, query, onTaskReceived, autoApply = true) => {
    console.log('开始流式任务分解:', { todosTree, selectedNodeId, query, autoApply })

    const body = {
      todosTree,
      selectedNodeId,
      query
    }

    // 获取同步队列以获取真实的parent_id
    const syncQueue = getSyncQueue()
    const realParentId = syncQueue.getRealId(selectedNodeId)

    // 收集的任务数据（用于非自动应用模式）
    const collectedTasks = []

    try {
      // 获取 Supabase 配置
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      // 直接使用 fetch 调用边缘函数以支持流式响应
      const response = await fetch(`${supabaseUrl}/functions/v1/breakdown_task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey
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
          if (!line.startsWith('data: ')) continue

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

      console.log(`${autoApply ? '成功添加' : '收集'} ${successCount}/${totalCount} 个子任务`)

      return {
        success: successCount > 0,
        addedCount: successCount,
        totalCount,
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

  // 自然语言任务分析并由后端直接入库
  const invokeAnalyzeAndCreate = async (query, parentId = null) => {
    const trimmedQuery = typeof query === 'string' ? query.trim() : ''
    if (!trimmedQuery) {
      return { success: false, error: '任务描述不能为空' }
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabasePubKey = import.meta.env.VITE_SUPABASE_PUB_KEY
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apikey = supabasePubKey || supabaseAnonKey

      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionResult?.session?.access_token) {
        return { success: false, error: '用户未登录或会话已失效' }
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/new_task_ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionResult.session.access_token}`,
          apikey
        },
        body: JSON.stringify({
          query: trimmedQuery,
          parentId
        })
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload?.success) {
        return {
          success: false,
          error: payload?.error || `HTTP ${response.status}`
        }
      }

      return {
        success: true,
        createdCount: payload.createdCount || 0,
        tasks: payload.tasks || []
      }
    } catch (error) {
      return {
        success: false,
        error: error?.message || '任务分析失败'
      }
    }
  }

  // 全局任务优化：后端读取全量任务并通过工具调用执行优化
  const invokeOptimizeTasks = async (query = '') => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabasePubKey = import.meta.env.VITE_SUPABASE_PUB_KEY
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const apikey = supabasePubKey || supabaseAnonKey

      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionResult?.session?.access_token) {
        return { success: false, error: '用户未登录或会话已失效' }
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/optimize_tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionResult.session.access_token}`,
          apikey
        },
        body: JSON.stringify({ query })
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        return {
          success: false,
          error: payload?.error || `HTTP ${response.status}`,
          summary: payload?.summary || ''
        }
      }

      return {
        success: true,
        summary: payload?.summary || '',
        changes: payload?.changes || {
          dateAdjusted: [],
          breakdowns: [],
          aggregations: [],
          recommendationTaskId: null
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error?.message || '任务优化失败'
      }
    }
  }

  return {
    invokeBreakdown,
    applyPendingTasks,
    invokeAnalyzeAndCreate,
    invokeOptimizeTasks
  }
}
