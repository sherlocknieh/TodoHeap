// Agent 工具集：把任务、日程与应用设置的读写能力暴露给任意 OpenAI 兼容模型
import {
  APP_SETTINGS,
  MODEL_PARAMETER_SETTINGS,
  describeUiPreferences,
  findSetting,
  normalizeSettingValue,
  writeUiPreference
} from './appSettings'
import { SKILL_ICONS } from './agentSkills'
import { disableCalendarFeed, rotateCalendarFeedToken } from './calendarTransfer'
import { fetchUserSettings } from './userSettings'

// 破坏性操作先由界面确认，避免模型直接清空数据或让订阅链接失效
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_todo',
  'delete_completed_todos',
  'permanent_delete_todo',
  'empty_trash',
  'rotate_calendar_feed',
  'disable_calendar_feed',
  'delete_skill'
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
      description: '设置一个或多个任务的完成状态，批量时用 ids。',
      parameters: objectSchema({
        id: nullableInteger('单个任务 id'),
        ids: {
          type: 'array',
          items: { type: 'integer' },
          description: '要批量处理的任务 id 列表'
        },
        completed: { type: 'boolean', description: 'true 标记完成，false 恢复未完成' }
      }, ['completed'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'link_todo',
      description: '把已有任务链接为另一个任务的子任务，保留它原有的父任务（多父关系）。',
      parameters: objectSchema({
        parent_id: integer('父任务 id'),
        child_id: integer('要链接的子任务 id')
      }, ['parent_id', 'child_id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'unlink_todo',
      description: '取消两个任务之间的父子链接，只从父任务移除引用，任务本身与其他父关系保留。',
      parameters: objectSchema({
        parent_id: integer('父任务 id'),
        child_id: integer('要取消链接的子任务 id')
      }, ['parent_id', 'child_id'])
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
  {
    type: 'function',
    function: {
      name: 'list_app_settings',
      description: '列出可修改的应用设置及当前值：界面偏好、模型参数、日历订阅与技能。修改前先调用它确认键名与取值范围。',
      parameters: objectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_app_setting',
      description: '修改一项界面偏好或模型参数。键名与取值必须来自 list_app_settings；模型密钥与地址不可修改。',
      parameters: objectSchema({
        key: text('设置键名，如 mindmap-direction、sidebar-open、temperature'),
        value: {
          description: '新值：布尔项传 true/false，枚举项传选项值，数值项传数字',
          type: ['boolean', 'string', 'number']
        }
      }, ['key', 'value'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description: '新建一个技能：一段可复用的指令，用户点选后填入输入框。',
      parameters: objectSchema({
        name: text('技能名称，最多 24 字'),
        prompt: text('技能指令全文'),
        icon: text('图标名，可选：sparkles、target、bulb、book、chart、calendar、list、clock'),
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '限定该技能可用的工具名；留空表示不限制'
        }
      }, ['name', 'prompt'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_skill',
      description: '修改已有技能的名称、指令、图标或工具白名单。',
      parameters: objectSchema({
        id: text('技能 id'),
        name: text('新名称'),
        prompt: text('新指令'),
        icon: text('新图标名'),
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '新的工具白名单；空数组表示不限制'
        }
      }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_skill',
      description: '删除一个技能。',
      parameters: objectSchema({ id: text('技能 id') }, ['id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'rotate_calendar_feed',
      description: '重新生成日历订阅令牌，旧订阅链接立即失效。',
      parameters: objectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'disable_calendar_feed',
      description: '关闭日历订阅，删除当前令牌，已订阅的日历将停止更新。',
      parameters: objectSchema({})
    }
  },
]

// 工具中文名同时供聊天记录与技能编辑使用，保持展示文案只有一处
export const AGENT_TOOL_LABELS = {
  list_todos: '查看任务',
  get_todo: '读取任务',
  create_todo: '创建任务',
  update_todo: '更新任务',
  move_todo: '移动任务',
  complete_todo: '切换完成状态',
  link_todo: '链接子任务',
  unlink_todo: '取消链接',
  delete_todo: '删除任务',
  delete_completed_todos: '清理已完成',
  restore_todo: '恢复任务',
  permanent_delete_todo: '永久删除任务',
  empty_trash: '清空回收站',
  list_trash: '查看回收站',
  list_schedules: '查看日程',
  create_schedule: '创建日程',
  update_schedule: '更新日程',
  delete_schedule: '删除日程',
  list_app_settings: '查看应用设置',
  update_app_setting: '修改应用设置',
  create_skill: '新建技能',
  update_skill: '修改技能',
  delete_skill: '删除技能',
  rotate_calendar_feed: '重置日历订阅',
  disable_calendar_feed: '关闭日历订阅'
}

export const AGENT_TOOL_NAMES = AGENT_TOOL_DEFINITIONS.map((definition) => definition.function.name)

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

// 建立 id → 任务、子 id → 首个父 id、子 id → 全部父 id 的索引，用于描述任务所在路径
const indexTodos = (todos) => {
  const byId = new Map()
  todos.forEach((todo) => byId.set(toNumber(todo.id), todo))
  const parentOf = new Map()
  const parentsOf = new Map()
  todos.forEach((todo) => {
    ;(todo.child_ids || []).forEach((childId) => {
      const key = toNumber(childId)
      if (!parentOf.has(key)) parentOf.set(key, toNumber(todo.id))
      const parents = parentsOf.get(key) || []
      parents.push(toNumber(todo.id))
      parentsOf.set(key, parents)
    })
  })
  return { byId, parentOf, parentsOf }
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

const serializeTodo = (todo, { byId, parentOf, parentsOf, includeDetails = false } = {}) => {
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
    parent_ids: parentsOf?.get(id) || [],
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

export const createAgentToolRunner = ({ todoStore, scheduleStore, authStore, llmStore, agentStore }) => {
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
      const { byId, parentOf, parentsOf } = indexTodos(todoStore.todos)
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
          .map((todo) => serializeTodo(todo, { byId, parentOf, parentsOf, includeDetails: Boolean(args.include_details) }))
      }
    },

    async get_todo(args) {
      await ensureTodos()
      const todo = findTodo(args.id)
      const { byId, parentOf, parentsOf } = indexTodos(todoStore.todos)
      const children = (todo.child_ids || [])
        .map((childId) => byId.get(toNumber(childId)))
        .filter(Boolean)
        .map((child) => serializeTodo(child, { byId, parentOf, parentsOf }))
      return {
        ok: true,
        task: { ...serializeTodo(todo, { byId, parentOf, parentsOf, includeDetails: true }), details: todo.details || '' },
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
      const ids = [...new Set([
        ...(Array.isArray(args.ids) ? args.ids : []),
        ...(args.id != null ? [args.id] : [])
      ])]
      if (!ids.length) throw new Error('需要提供 id 或 ids')

      const completed = Boolean(args.completed)
      const completedAt = completed ? new Date().toISOString() : null
      const changed = []
      const unchanged = []
      const failed = []

      for (const rawId of ids) {
        try {
          const todo = findTodo(rawId)
          if (Boolean(todo.completed_at) === completed) {
            unchanged.push({ id: toNumber(todo.id), title: todo.title })
            continue
          }
          const result = await todoStore.updateTodo(todo.id, { completed_at: completedAt })
          if (!result.success) throw new Error(result.error || '更新完成状态失败')
          changed.push({ id: toNumber(todo.id), title: todo.title })
        } catch (err) {
          failed.push({ id: rawId, error: err?.message || String(err) })
        }
      }

      if (!changed.length && failed.length) {
        throw new Error(failed.map((item) => `任务 ${item.id}：${item.error}`).join('；'))
      }
      // 部分失败仍算执行成功，具体失败项通过 failed 告诉模型
      return { ok: true, completed, updated: changed, unchanged, failed }
    },

    async link_todo(args) {
      await ensureTodos()
      const parent = findTodo(args.parent_id)
      const child = findTodo(args.child_id)
      if (toNumber(parent.id) === toNumber(child.id)) throw new Error('任务不能链接到自己')

      const childIds = parent.child_ids || []
      if (childIds.map(toNumber).includes(toNumber(child.id))) {
        return {
          ok: true,
          unchanged: true,
          parent: { id: toNumber(parent.id), title: parent.title },
          child: { id: toNumber(child.id), title: child.title }
        }
      }

      const result = await todoStore.updateTodo(parent.id, { child_ids: [...childIds, child.id] })
      if (!result.success) throw new Error(result.error || '链接失败')
      return {
        ok: true,
        parent: { id: toNumber(parent.id), title: parent.title },
        child: { id: toNumber(child.id), title: child.title }
      }
    },

    async unlink_todo(args) {
      await ensureTodos()
      const parent = findTodo(args.parent_id)
      const child = findTodo(args.child_id)
      const childIds = parent.child_ids || []
      const nextIds = childIds.filter((id) => toNumber(id) !== toNumber(child.id))
      if (nextIds.length === childIds.length) {
        return {
          ok: true,
          unchanged: true,
          parent: { id: toNumber(parent.id), title: parent.title },
          child: { id: toNumber(child.id), title: child.title }
        }
      }

      const result = await todoStore.updateTodo(parent.id, { child_ids: nextIds })
      if (!result.success) throw new Error(result.error || '取消链接失败')
      return {
        ok: true,
        parent: { id: toNumber(parent.id), title: parent.title },
        child: { id: toNumber(child.id), title: child.title }
      }
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
    },

    // 设置快照：界面偏好取本地值，模型参数取当前配置，日历与技能取已加载状态
    async list_app_settings() {
      const ui = describeUiPreferences()
      const model = MODEL_PARAMETER_SETTINGS.map((setting) => ({
        key: setting.key,
        label: setting.label,
        group: setting.group,
        type: setting.type,
        value: llmStore?.config?.[setting.key] ?? setting.default,
        min: setting.min,
        max: setting.max
      }))
      const settings = await fetchUserSettings(requireUserId()).catch(() => ({ success: false }))
      const calendar = {
        enabled: Boolean(settings.success && settings.data?.calendarFeedToken),
        token: settings.success ? (settings.data?.calendarFeedToken || '') : ''
      }
      return {
        ok: true,
        settings: [...ui, ...model],
        calendar,
        skills: (agentStore?.skills || []).map((skill) => ({
          id: skill.id,
          name: skill.name,
          icon: skill.icon,
          tools: skill.tools || [],
          prompt: skill.prompt
        }))
      }
    },

    async update_app_setting(args) {
      const setting = findSetting(args.key)
      if (!setting) {
        throw new Error(`未知设置项 ${args.key}；可用键名：${APP_SETTINGS.map((item) => item.key).join('、')}`)
      }
      const value = normalizeSettingValue(setting, args.value)

      if (setting.group === '模型') {
        if (!llmStore) throw new Error('模型配置不可用')
        llmStore.update({ [setting.key]: value })
        return { ok: true, key: setting.key, label: setting.label, value }
      }

      writeUiPreference(setting, value)
      return { ok: true, key: setting.key, label: setting.label, value }
    },

    async create_skill(args) {
      if (!agentStore) throw new Error('技能不可用')
      const saved = agentStore.addSkill({
        name: args.name,
        prompt: args.prompt,
        icon: SKILL_ICONS.includes(args.icon) ? args.icon : undefined,
        tools: args.tools
      })
      if (!saved) throw new Error('技能需要名称与指令')
      return { ok: true, skill: { id: saved.id, name: saved.name, icon: saved.icon, tools: saved.tools } }
    },

    async update_skill(args) {
      if (!agentStore) throw new Error('技能不可用')
      const current = (agentStore.skills || []).find((skill) => skill.id === args.id)
      if (!current) throw new Error(`技能 ${args.id} 不存在`)
      const patch = {}
      if ('name' in args) patch.name = args.name
      if ('prompt' in args) patch.prompt = args.prompt
      if ('icon' in args) patch.icon = args.icon
      if ('tools' in args) patch.tools = args.tools
      if (!Object.keys(patch).length) throw new Error('没有要更新的字段')

      const saved = agentStore.updateSkill(current.id, patch)
      if (!saved) throw new Error('技能名称与指令不能为空')
      return { ok: true, skill: { id: saved.id, name: saved.name, icon: saved.icon, tools: saved.tools } }
    },

    async delete_skill(args) {
      if (!agentStore) throw new Error('技能不可用')
      const current = (agentStore.skills || []).find((skill) => skill.id === args.id)
      if (!current) throw new Error(`技能 ${args.id} 不存在`)
      if (!agentStore.deleteSkill(current.id)) throw new Error('技能删除失败')
      return { ok: true, deleted: { id: current.id, name: current.name } }
    },

    async rotate_calendar_feed() {
      const userId = requireUserId()
      const latest = await fetchUserSettings(userId)
      const result = await rotateCalendarFeedToken(userId, latest.success ? latest.data : {})
      if (!result.success) throw new Error(result.error?.message || '重置订阅令牌失败')
      return { ok: true, token: result.token }
    },

    async disable_calendar_feed() {
      const userId = requireUserId()
      const latest = await fetchUserSettings(userId)
      const result = await disableCalendarFeed(userId, latest.success ? latest.data : {})
      if (!result.success) throw new Error(result.error?.message || '关闭日历订阅失败')
      return { ok: true, disabled: true }
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
