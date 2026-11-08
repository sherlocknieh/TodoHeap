// Agent 工具集：把任务与日程的读写能力暴露给任意 OpenAI 兼容模型

// 破坏性操作先由界面确认，避免模型直接清空数据
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_todo',
  'delete_completed_todos',
  'permanent_delete_todo',
  'empty_trash'
])

const objectSchema = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
})

const text = (description) => ({ type: 'string', description })
const integer = (description) => ({ type: 'integer', description })
const nullableText = (description) => ({ type: ['string', 'null'], description })
const nullableNumber = (description) => ({ type: ['number', 'null'], description })
const nullableInteger = (description) => ({ type: ['integer', 'null'], description })

const taskFields = {
  title: text('任务标题'),
  details: nullableText('任务详情，Markdown 文本；null 表示清空'),
  deadline: nullableText('截止时间，带时区的 ISO 8601，如 2026-11-10T18:00:00+08:00；null 表示清空'),
  difficulty: nullableNumber('预计工时，单位小时；null 表示清空'),
  sort_order: nullableInteger('同级排序序号，越小越靠前')
}

const subtaskSchema = objectSchema({
  title: text('子任务标题'),
  details: nullableText('子任务详情'),
  deadline: nullableText('子任务截止时间'),
  difficulty: nullableNumber('子任务预计工时')
}, ['title'])

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_todos',
      description: '列出当前用户的任务（可筛选关键字、完成状态、是否逾期）。需要任务 id 或了解现状时先调用。',
      parameters: objectSchema({
        query: text('按标题或详情模糊搜索'),
        completed: { type: 'string', enum: ['active', 'done', 'all'], description: '默认 active 只看未完成' },
        overdue_only: { type: 'boolean', description: '只看已逾期且未完成的任务' },
        limit: integer('最多返回条数，默认 100，上限 300'),
        include_details: { type: 'boolean', description: '是否返回任务详情全文' }
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_todo',
      description: '读取单个任务的完整字段、父任务与子任务列表。',
      parameters: objectSchema({ id: integer('任务 id') }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: '创建任务；可用 subtasks 一次性创建它的子任务。',
      parameters: objectSchema({
        title: text('任务标题'),
        details: nullableText('任务详情，Markdown 文本'),
        deadline: nullableText('截止时间，带时区的 ISO 8601'),
        difficulty: nullableNumber('预计工时，单位小时'),
        sort_order: nullableInteger('排序序号'),
        parent_id: nullableInteger('父任务 id，不填则创建为根任务'),
        subtasks: {
          type: 'array',
          description: '要挂在该任务下的子任务',
          items: subtaskSchema
        }
      }, ['title'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: '修改任务字段。只需传要改的字段；传 null 清空详情、截止时间或工时。',
      parameters: objectSchema({
        id: integer('任务 id'),
        title: text('新标题'),
        details: nullableText('新详情；null 清空'),
        deadline: nullableText('新截止时间；null 清空'),
        difficulty: nullableNumber('新工时；null 清空'),
        sort_order: nullableInteger('新排序序号')
      }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_todo',
      description: '把任务移动到另一个父任务下，或移动到根层级。',
      parameters: objectSchema({
        id: integer('要移动的任务 id'),
        new_parent_id: nullableInteger('新父任务 id；null 表示移到根层级')
      }, ['id', 'new_parent_id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: '设置任务的完成状态。',
      parameters: objectSchema({
        id: integer('任务 id'),
        completed: { type: 'boolean', description: 'true 标记完成，false 恢复未完成' }
      }, ['id', 'completed'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: '把任务及其子任务移入回收站（软删除）。',
      parameters: objectSchema({ id: integer('任务 id') }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_completed_todos',
      description: '把所有已完成任务移入回收站。',
      parameters: objectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'restore_todo',
      description: '从回收站恢复任务及其子任务。',
      parameters: objectSchema({ id: integer('回收站中的任务 id') }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'permanent_delete_todo',
      description: '永久删除回收站中的任务，无法恢复。',
      parameters: objectSchema({ id: integer('回收站中的任务 id') }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'empty_trash',
      description: '清空回收站，永久删除其中所有任务。',
      parameters: objectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_trash',
      description: '列出回收站中的任务。',
      parameters: objectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_schedules',
      description: '列出日程事件，可按时间范围筛选。',
      parameters: objectSchema({
        from: nullableText('起始时间，ISO 8601'),
        to: nullableText('结束时间，ISO 8601')
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_schedule',
      description: '创建一条日程事件。',
      parameters: objectSchema({
        title: text('日程标题'),
        start_at: text('开始时间，带时区的 ISO 8601'),
        end_at: text('结束时间，带时区的 ISO 8601'),
        notes: nullableText('备注'),
        todo_id: nullableInteger('关联的任务 id')
      }, ['title', 'start_at', 'end_at'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_schedule',
      description: '修改日程的标题、备注或时间。',
      parameters: objectSchema({
        id: integer('日程 id'),
        title: text('新标题'),
        notes: nullableText('新备注；null 清空'),
        start_at: text('新开始时间'),
        end_at: text('新结束时间')
      }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_schedule',
      description: '删除一条日程事件。',
      parameters: objectSchema({ id: integer('日程 id') }, ['id'])
    }
  },
]

const toNumber = (value) => Number(value)

const normalizeDate = (value, label = '时间') => {
  if (value === undefined || value === null || value === '') return null
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) throw new Error(`${label}无法识别：${value}`)
  return time.toISOString()
}

const normalizeNumber = (value, label = '数值') => {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label}必须是数字`)
  return number
}

const normalizeInteger = (value, label = '序号') => {
  const number = normalizeNumber(value, label)
  return number === null ? null : Math.trunc(number)
}

// 建立 id → 任务、子 id → 父 id 的索引，用于描述任务所在路径
const indexTodos = (todos) => {
  const byId = new Map()
  todos.forEach((todo) => byId.set(toNumber(todo.id), todo))
  const parentOf = new Map()
  todos.forEach((todo) => {
    ;(todo.child_ids || []).forEach((childId) => {
      const key = toNumber(childId)
      if (!parentOf.has(key)) parentOf.set(key, toNumber(todo.id))
    })
  })
  return { byId, parentOf }
}

const buildPath = (id, byId, parentOf) => {
  const titles = []
  const visited = new Set()
  let current = toNumber(id)
  while (current != null && byId.has(current) && !visited.has(current)) {
    visited.add(current)
    titles.unshift(byId.get(current).title)
    current = parentOf.get(current)
  }
  return titles.join(' / ')
}

const serializeTodo = (todo, { byId, parentOf, includeDetails = false } = {}) => {
  const id = toNumber(todo.id)
  return {
    id,
    title: todo.title,
    path: buildPath(id, byId, parentOf),
    completed: Boolean(todo.completed_at),
    completed_at: todo.completed_at || null,
    deadline: todo.deadline || null,
    difficulty: todo.difficulty ?? null,
    sort_order: todo.sort_order ?? null,
    parent_id: parentOf.get(id) ?? null,
    child_ids: (todo.child_ids || []).map(toNumber),
    ...(includeDetails ? { details: todo.details || '' } : {})
  }
}

const serializeSchedule = (schedule) => ({
  id: toNumber(schedule.id),
  title: schedule.title,
  notes: schedule.notes || '',
  start_at: schedule.start_at,
  end_at: schedule.end_at,
  todo_id: schedule.todo_id ?? null
})

export const createAgentToolRunner = ({ todoStore, scheduleStore, authStore }) => {
  const requireUserId = () => {
    const userId = authStore.user?.id
    if (!userId) throw new Error('请先登录')
    return userId
  }

  // 等待正在进行的拉取结束，避免工具拿到空列表
  const waitWhile = async (predicate, timeoutMs = 5000) => {
    const startedAt = Date.now()
    while (predicate() && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  }

  const ensureTodos = async () => {
    if (todoStore.isFetched) return
    await waitWhile(() => todoStore.loading)
    if (!todoStore.isFetched) await todoStore.fetchTodos()
  }

  const ensureTrash = async () => {
    await waitWhile(() => todoStore.trashLoading)
    await todoStore.fetchTrash()
  }

  const ensureSchedules = async () => {
    if (scheduleStore.isFetched) return
    await waitWhile(() => scheduleStore.loading)
    if (!scheduleStore.isFetched) await scheduleStore.fetchSchedules()
  }

  const findTodo = (id) => {
    const numericId = normalizeInteger(id, '任务 id')
    const todo = todoStore.todos.find((item) => toNumber(item.id) === numericId)
    if (!todo) throw new Error(`任务 ${numericId} 不存在`)
    return todo
  }

  const findSchedule = (id) => {
    const numericId = normalizeInteger(id, '日程 id')
    const schedule = scheduleStore.schedules.find((item) => toNumber(item.id) === numericId)
    if (!schedule) throw new Error(`日程 ${numericId} 不存在`)
    return schedule
  }

  const handlers = {
    async list_todos(args) {
      await ensureTodos()
      const { byId, parentOf } = indexTodos(todoStore.todos)
      const mode = args.completed === 'done' || args.completed === 'all' ? args.completed : 'active'
      const query = String(args.query || '').trim().toLowerCase()
      const now = Date.now()

      const filtered = todoStore.todos.filter((todo) => {
        if (mode === 'active' && todo.completed_at) return false
        if (mode === 'done' && !todo.completed_at) return false
        if (query) {
          const haystack = `${todo.title || ''} ${todo.details || ''}`.toLowerCase()
          if (!haystack.includes(query)) return false
        }
        if (args.overdue_only) {
          if (!todo.deadline || todo.completed_at) return false
          if (new Date(todo.deadline).getTime() >= now) return false
        }
        return true
      })

      const limit = Math.min(300, Math.max(1, normalizeInteger(args.limit ?? 100, 'limit') || 100))
      return {
        ok: true,
        matching: filtered.length,
        count: Math.min(filtered.length, limit),
        truncated: filtered.length > limit,
        tasks: filtered
          .slice(0, limit)
          .map((todo) => serializeTodo(todo, { byId, parentOf, includeDetails: Boolean(args.include_details) }))
      }
    },

    async get_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const { byId, parentOf } = indexTodos(todoStore.todos)
      const children = (todo.child_ids || [])
        .map((childId) => byId.get(toNumber(childId)))
        .filter(Boolean)
        .map((child) => serializeTodo(child, { byId, parentOf }))
      return {
        ok: true,
        task: { ...serializeTodo(todo, { byId, parentOf, includeDetails: true }), details: todo.details || '' },
        children
      }
    },

    async create_todo(args) {
      await ensureTodos()
      const title = String(args.title || '').trim()
      if (!title) throw new Error('标题不能为空')

      const parentId = normalizeInteger(args.parent_id, '父任务 id')
      if (parentId != null) findTodo(parentId)

      const result = await todoStore.addTodo(title, {
        details: args.details ?? null,
        deadline: normalizeDate(args.deadline, '截止时间'),
        difficulty: normalizeNumber(args.difficulty, '工时'),
        sort_order: normalizeInteger(args.sort_order, '排序序号'),
        parent_id: parentId
      })
      if (!result.success) throw new Error(result.error || '创建任务失败')

      const created = result.data
      const subtasks = []
      const pendingSubtasks = Array.isArray(args.subtasks) ? args.subtasks : []
      for (const [index, sub] of pendingSubtasks.entries()) {
        const subTitle = String(sub?.title || '').trim()
        if (!subTitle) continue
        const subResult = await todoStore.addTodo(subTitle, {
          details: sub.details ?? null,
          deadline: normalizeDate(sub.deadline, '子任务截止时间'),
          difficulty: normalizeNumber(sub.difficulty, '子任务工时'),
          sort_order: index + 1,
          parent_id: created.id
        })
        if (subResult.success) subtasks.push({ id: subResult.data.id, title: subResult.data.title })
      }

      return {
        ok: true,
        task: { id: created.id, title: created.title, parent_id: parentId },
        subtasks
      }
    },

    async update_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const updates = {}

      if ('title' in args) {
        const title = String(args.title || '').trim()
        if (!title) throw new Error('标题不能为空')
        updates.title = title
      }
      if ('details' in args) updates.details = args.details ?? null
      if ('deadline' in args) updates.deadline = normalizeDate(args.deadline, '截止时间')
      if ('difficulty' in args) updates.difficulty = normalizeNumber(args.difficulty, '工时')
      if ('sort_order' in args) updates.sort_order = normalizeInteger(args.sort_order, '排序序号')
      if (Object.keys(updates).length === 0) throw new Error('没有要更新的字段')

      const result = await todoStore.updateTodo(todo.id, updates)
      if (!result.success) throw new Error(result.error || '更新任务失败')
      return { ok: true, task: { id: result.data.id, title: result.data.title, ...updates } }
    },

    async move_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const { parentOf } = indexTodos(todoStore.todos)
      const oldParentId = parentOf.get(toNumber(todo.id)) ?? null
      const newParentId = normalizeInteger(args.new_parent_id, '新父任务 id')

      if (newParentId === toNumber(todo.id)) throw new Error('任务不能成为自己的父任务')
      if (oldParentId === newParentId) return { ok: true, unchanged: true }

      if (newParentId != null) {
        findTodo(newParentId)
        // 沿祖先链检查目标父任务，防止把父节点移到自己的后代下形成环
        const visited = new Set()
        let cursor = newParentId
        while (cursor != null && !visited.has(cursor)) {
          if (cursor === toNumber(todo.id)) throw new Error('不能把任务移动到它自己的子任务下')
          visited.add(cursor)
          cursor = parentOf.get(cursor) ?? null
        }
      }

      if (oldParentId != null) {
        const oldParent = findTodo(oldParentId)
        const nextChildIds = (oldParent.child_ids || []).filter((id) => toNumber(id) !== toNumber(todo.id))
        const result = await todoStore.updateTodo(oldParent.id, { child_ids: nextChildIds })
        if (!result.success) throw new Error(result.error || '从原父任务移除失败')
      }

      if (newParentId != null) {
        const newParent = findTodo(newParentId)
        const nextChildIds = [...new Set([...(newParent.child_ids || []).map(toNumber), toNumber(todo.id)])]
        const result = await todoStore.updateTodo(newParent.id, { child_ids: nextChildIds })
        if (!result.success) throw new Error(result.error || '挂载到新父任务失败')
      }

      return { ok: true, task: { id: todo.id, title: todo.title }, parent_id: newParentId }
    },

    async complete_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const completed = Boolean(args.completed)
      if (Boolean(todo.completed_at) === completed) {
        return { ok: true, unchanged: true, task: { id: todo.id, title: todo.title, completed } }
      }
      const result = await todoStore.updateTodo(todo.id, {
        completed_at: completed ? new Date().toISOString() : null
      })
      if (!result.success) throw new Error(result.error || '更新完成状态失败')
      return { ok: true, task: { id: todo.id, title: todo.title, completed } }
    },

    async delete_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const result = await todoStore.deleteTodo(todo.id)
      if (!result.success) throw new Error(result.error || '删除任务失败')
      return { ok: true, deleted: { id: todo.id, title: todo.title } }
    },

    async delete_completed_todos() {
      await ensureTodos()
      const result = await todoStore.deleteCompletedTodos()
      if (!result.success) throw new Error(result.error || '清理已完成任务失败')
      return { ok: true, count: result.count || 0 }
    },

    async restore_todo(args) {
      await ensureTrash()
      const numericId = normalizeInteger(args.id, '任务 id')
      const trashed = todoStore.trashTodos.find((item) => toNumber(item.id) === numericId)
      if (!trashed) throw new Error(`回收站中没有任务 ${numericId}`)
      const result = await todoStore.restoreTodo(numericId)
      if (!result.success) throw new Error(result.error || '恢复任务失败')
      return { ok: true, restored: { id: numericId, title: trashed.title } }
    },

    async permanent_delete_todo(args) {
      await ensureTrash()
      const numericId = normalizeInteger(args.id, '任务 id')
      const trashed = todoStore.trashTodos.find((item) => toNumber(item.id) === numericId)
      if (!trashed) throw new Error(`回收站中没有任务 ${numericId}`)
      const result = await todoStore.permanentDeleteTodo(numericId)
      if (!result.success) throw new Error(result.error || '永久删除失败')
      return { ok: true, deleted: { id: numericId, title: trashed.title } }
    },

    async empty_trash() {
      await ensureTrash()
      const count = todoStore.trashTodos.length
      if (!count) return { ok: true, count: 0 }
      const result = await todoStore.emptyTrash()
      if (!result.success) throw new Error(result.error || '清空回收站失败')
      return { ok: true, count }
    },

    async list_trash() {
      await ensureTrash()
      return {
        ok: true,
        count: todoStore.trashTodos.length,
        tasks: todoStore.trashTodos.map((todo) => ({
          id: toNumber(todo.id),
          title: todo.title,
          deleted_at: todo.deleted_at || null,
          deadline: todo.deadline || null,
          child_count: (todo.child_ids || []).length
        }))
      }
    },

    async list_schedules(args) {
      await ensureSchedules()
      const from = args.from ? new Date(args.from).getTime() : null
      const to = args.to ? new Date(args.to).getTime() : null
      const matched = scheduleStore.schedules.filter((schedule) => {
        const start = new Date(schedule.start_at).getTime()
        if (from != null && start < from) return false
        if (to != null && start > to) return false
        return true
      })
      return { ok: true, count: matched.length, schedules: matched.map(serializeSchedule) }
    },

    async create_schedule(args) {
      requireUserId()
      const title = String(args.title || '').trim()
      if (!title) throw new Error('日程标题不能为空')
      const startAt = normalizeDate(args.start_at, '开始时间')
      const endAt = normalizeDate(args.end_at, '结束时间')
      if (!startAt || !endAt) throw new Error('日程需要开始与结束时间')
      if (new Date(endAt).getTime() <= new Date(startAt).getTime()) throw new Error('结束时间必须晚于开始时间')

      const result = await scheduleStore.createSchedules([{
        title,
        notes: args.notes ?? null,
        start_at: startAt,
        end_at: endAt,
        todo_id: normalizeInteger(args.todo_id, '关联任务 id')
      }])
      if (!result.success) throw new Error(result.error || '创建日程失败')
      return { ok: true, schedule: serializeSchedule(result.data[0]) }
    },

    async update_schedule(args) {
      await ensureSchedules()
      const schedule = findSchedule(args.id)
      const updates = {}
      if ('title' in args) {
        const title = String(args.title || '').trim()
        if (!title) throw new Error('日程标题不能为空')
        updates.title = title
      }
      if ('notes' in args) updates.notes = args.notes ?? null
      if ('start_at' in args) updates.start_at = normalizeDate(args.start_at, '开始时间')
      if ('end_at' in args) updates.end_at = normalizeDate(args.end_at, '结束时间')
      if (Object.keys(updates).length === 0) throw new Error('没有要更新的字段')

      const startAt = new Date(updates.start_at ?? schedule.start_at).getTime()
      const endAt = new Date(updates.end_at ?? schedule.end_at).getTime()
      if (endAt <= startAt) throw new Error('结束时间必须晚于开始时间')

      const result = await scheduleStore.updateSchedule(schedule.id, updates)
      if (!result.success) throw new Error(result.error || '更新日程失败')
      return { ok: true, schedule: serializeSchedule(result.data) }
    },

    async delete_schedule(args) {
      await ensureSchedules()
      const schedule = findSchedule(args.id)
      const result = await scheduleStore.deleteSchedule(schedule.id)
      if (!result.success) throw new Error(result.error || '删除日程失败')
      return { ok: true, deleted: { id: schedule.id, title: schedule.title } }
    }
  }

  // 统一捕获参数或数据错误，让模型看到可读的失败原因并自行调整
  const run = async (name, args) => {
    const handler = handlers[name]
    if (!handler) return { ok: false, error: `未知工具：${name}` }
    try {
      return await handler(args && typeof args === 'object' ? args : {})
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  }

  return { definitions: AGENT_TOOL_DEFINITIONS, run }
}
