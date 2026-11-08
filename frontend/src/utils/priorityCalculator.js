/**
 * 优先级计算器
 * 根据多个维度综合计算任务的实际优先级
 */

/**
 * 计算任务的综合优先级
 * 
 * 优先级维度：
 * 1. 截止日期紧急度: 根据距离截止时间的天数
 * 2. 任务进度: 已完成比例越高，优先级越低
 * 3. 子任务数量: 有更多子任务的父任务优先级更高（更复杂）
 *
 * 最终公式：
 * finalScore = urgencyScore * 100 + progressScore * 20 + complexityScore * 10
 */

export function calculatePriority(todo, allTodos = []) {
  const scores = {
    urgency: calculateUrgencyScore(todo),
    progress: calculateProgressScore(todo, allTodos),
    complexity: calculateComplexityScore(todo, allTodos)
  }

  // 权重配置（可根据业务需求调整）
  const weights = {
    urgency: 100,
    progress: 20,
    complexity: 10
  }

  const finalScore =
    scores.urgency * weights.urgency +
    scores.progress * weights.progress +
    scores.complexity * weights.complexity

  return {
    finalScore,
    scores,
    weights,
    breakdown: {
      daysUntilDeadline: calculateDaysUntilDeadline(todo),
      progressPercent: calculateProgressPercent(todo, allTodos),
      childCount: countChildren(todo, allTodos),
      completed: Boolean(todo.completed_at)
    }
  }
}

/**
 * 截止日期紧急度分数 (0-1)
 * 距离截止时间越近，分数越高
 */
function calculateUrgencyScore(todo) {
  if (!todo.deadline) {
    return 0 // 无截止日期，无紧急度
  }

  const now = new Date()
  const deadline = new Date(todo.deadline)
  const daysRemaining = (deadline - now) / (1000 * 60 * 60 * 24)

  if (daysRemaining < 0) {
    return 1.0 // 已超期，最紧急
  }

  if (daysRemaining <= 1) {
    return 0.95 // 明天到期
  }

  if (daysRemaining <= 3) {
    return 0.80 // 3天内
  }

  if (daysRemaining <= 7) {
    return 0.60 // 一周内
  }

  if (daysRemaining <= 14) {
    return 0.40 // 两周内
  }

  if (daysRemaining <= 30) {
    return 0.20 // 一个月内
  }

  return 0.05 // 一个月以上
}

/**
 * 任务进度百分比: 有子任务时按直接子任务完成比例, 否则按自身完成状态
 */
function calculateProgressPercent(todo, allTodos) {
  const children = getChildren(todo, allTodos)
  if (children.length > 0) {
    const doneCount = children.filter(child => child.completed_at).length
    return Math.round((doneCount / children.length) * 100)
  }
  return todo.completed_at ? 100 : 0
}

// 子任务由父节点的 child_ids 声明
function getChildren(todo, allTodos) {
  if (!allTodos || !todo || !Array.isArray(todo.child_ids)) return []
  const childIds = new Set(todo.child_ids)
  return allTodos.filter(item => childIds.has(item.id))
}

/**
 * 任务进度分数 (0-1)
 * 进度越高，优先级越低（因为快完成了）
 */
function calculateProgressScore(todo, allTodos) {
  const progress = calculateProgressPercent(todo, allTodos)
  // 反向映射：100% 进度 -> 0分，0% 进度 -> 0.5分
  return Math.max(0, 0.5 - (progress / 100) * 0.5)
}

/**
 * 任务复杂度分数 (0-1)
 * 有更多子任务的任务优先级更高（表示更复杂）
 */
function calculateComplexityScore(todo, allTodos) {
  const childCount = countChildren(todo, allTodos)

  if (childCount === 0) {
    return 0.25 // 无子任务，复杂度低
  }

  if (childCount <= 3) {
    return 0.50 // 少数子任务
  }

  if (childCount <= 10) {
    return 0.75 // 多个子任务
  }

  return 1.0 // 很多子任务
}

/**
 * 计算距离截止日期的天数
 */
function calculateDaysUntilDeadline(todo) {
  if (!todo.deadline) return null

  const now = new Date()
  const deadline = new Date(todo.deadline)
  const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
  
  return daysRemaining
}

/**
 * 统计子任务数量
 */
function countChildren(todo, allTodos) {
  return getChildren(todo, allTodos).length
}

/**
 * 批量计算所有任务的优先级
 * 返回按优先级排序的任务列表
 */
export function calculatePrioritiesForAll(todos) {
  if (!todos || todos.length === 0) return []
  
  try {
    return todos
      .map(todo => ({
        ...todo,
        priorityInfo: calculatePriority(todo, todos)
      }))
      .sort((a, b) => b.priorityInfo.finalScore - a.priorityInfo.finalScore)
  } catch (e) {
    console.error('批量计算优先级出错:', e)
    // 失败时回退到简单排序
    return todos.map(todo => ({
      ...todo,
      priorityInfo: {
        finalScore: 0,
        scores: {},
        breakdown: {}
      }
    }))
  }
}

/**
 * 获取优先级等级名称
 */
export function getPriorityLevelName(score) {
  if (score >= 100) return '紧急'
  if (score >= 70) return '高'
  if (score >= 40) return '中'
  return '低'
}

/**
 * 获取优先级等级颜色
 */
export function getPriorityLevelColor(score) {
  if (score >= 100) return '#ef4444' // 红色
  if (score >= 70) return '#f59e0b' // 橙色
  if (score >= 40) return '#eab308' // 黄色
  return '#22c55e' // 绿色
}

/**
 * 获取紧急度等级名称
 */
export function getUrgencyLevelName(daysRemaining) {
  if (daysRemaining === null) return '无截止期'
  if (daysRemaining < 0) return '已超期'
  if (daysRemaining === 0) return '今天到期'
  if (daysRemaining === 1) return '明天到期'
  if (daysRemaining <= 7) return `${daysRemaining}天内`
  if (daysRemaining <= 30) return `${Math.floor(daysRemaining / 7)}周内`
  return `${Math.floor(daysRemaining / 30)}个月内`
}
