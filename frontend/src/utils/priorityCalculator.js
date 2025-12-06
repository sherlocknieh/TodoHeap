/**
 * 优先级计算器
 * 根据多个维度综合计算任务的实际优先级
 */

/**
 * 计算任务的综合优先级
 * 
 * 优先级维度：
 * 1. 基础优先级 (0-3): 用户手动设置，权重最高
 * 2. 截止日期紧急度: 根据距离截止时间的天数
 * 3. 任务进度: 已完成比例越高，优先级越低
 * 4. 子任务数量: 有更多子任务的父任务优先级更高（更复杂）
 * 5. 任务状态: 进行中 > 待办 > 已完成
 * 
 * 最终公式：
 * finalScore = baseScore * 100 + urgencyScore * 30 + progressScore * 20 + complexityScore * 10 + statusScore * 5
 */

export function calculatePriority(todo, allTodos = []) {
  const scores = {
    base: calculateBaseScore(todo),
    urgency: calculateUrgencyScore(todo),
    progress: calculateProgressScore(todo),
    complexity: calculateComplexityScore(todo, allTodos),
    status: calculateStatusScore(todo)
  }

  // 权重配置（可根据业务需求调整）
  const weights = {
    base: 100,
    urgency: 30,
    progress: 20,
    complexity: 10,
    status: 5
  }

  const finalScore =
    scores.base * weights.base +
    scores.urgency * weights.urgency +
    scores.progress * weights.progress +
    scores.complexity * weights.complexity +
    scores.status * weights.status

  return {
    finalScore,
    scores,
    weights,
    breakdown: {
      baseLevel: todo.priority || 0,
      daysUntilDeadline: calculateDaysUntilDeadline(todo),
      progressPercent: todo.progress || 0,
      childCount: countChildren(todo.id, allTodos),
      status: todo.status
    }
  }
}

/**
 * 基础优先级分数 (0-3 -> 0-1)
 * 用户手动设置的优先级
 */
function calculateBaseScore(todo) {
  const level = todo.priority || 0
  const scores = {
    0: 0.25,  // 低优先级
    1: 0.50,  // 中优先级
    2: 0.75,  // 高优先级
    3: 1.0    // 紧急
  }
  return scores[level] || 0.25
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
 * 任务进度分数 (0-1)
 * 进度越高，优先级越低（因为快完成了）
 */
function calculateProgressScore(todo) {
  const progress = todo.progress || 0
  // 反向映射：100% 进度 -> 0分，0% 进度 -> 0.5分
  return Math.max(0, 0.5 - (progress / 100) * 0.5)
}

/**
 * 任务复杂度分数 (0-1)
 * 有更多子任务的任务优先级更高（表示更复杂）
 */
function calculateComplexityScore(todo, allTodos) {
  const childCount = countChildren(todo.id, allTodos)

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
 * 任务状态分数 (0-1)
 * 进行中 > 待办 > 已完成
 */
function calculateStatusScore(todo) {
  const statusScores = {
    doing: 1.0,   // 正在进行，优先级最高
    todo: 0.7,    // 待办，中等优先级
    done: 0,      // 已完成，不优先
    deleted: -1   // 已删除，最低
  }
  return statusScores[todo.status] || 0
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
function countChildren(parentId, allTodos) {
  if (!allTodos || allTodos.length === 0) return 0
  return allTodos.filter(todo => todo.parent_id === parentId).length
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
        finalScore: (todo.priority || 0) * 100,
        scores: { base: todo.priority || 0 },
        breakdown: { baseLevel: todo.priority || 0 }
      }
    }))
  }
}

/**
 * 获取优先级等级名称
 */
export function getPriorityLevelName(score) {
  if (score >= 300) return '🔴 紧急'
  if (score >= 200) return '🟠 高'
  if (score >= 100) return '🟡 中'
  return '🟢 低'
}

/**
 * 获取优先级等级颜色
 */
export function getPriorityLevelColor(score) {
  if (score >= 300) return '#ef4444' // 红色
  if (score >= 200) return '#f59e0b' // 橙色
  if (score >= 100) return '#eab308' // 黄色
  return '#84cc16' // 绿色
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
