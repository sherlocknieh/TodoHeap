import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createAgentToolRunner, DESTRUCTIVE_TOOLS } from './agentTools'

let nextTempId

const createTodoRow = (overrides = {}) => ({
  id: 1,
  title: '根任务',
  details: '',
  deadline: null,
  difficulty: null,
  sort_order: null,
  completed_at: null,
  child_ids: [],
  ...overrides
})

const makeTodoStore = (initial = []) => {
  const todosRef = ref(initial.map((item) => ({ ...item, child_ids: [...(item.child_ids || [])] })))
  const trashTodosRef = ref([])

  return {
    get todos() {
      return todosRef.value
    },
    get trashTodos() {
      return trashTodosRef.value
    },
    isFetched: true,
    fetchTodos: vi.fn(async () => {}),
    fetchTrash: vi.fn(async () => {}),
    addTodo: vi.fn(async (title, options = {}) => {
      const id = nextTempId--
      const todo = createTodoRow({
        id,
        title,
        details: options.details ?? null,
        deadline: options.deadline ?? null,
        difficulty: options.difficulty ?? null,
        sort_order: options.sort_order ?? null,
        completed_at: null,
        child_ids: []
      })
      todosRef.value.push(todo)
      if (options.parent_id != null) {
        const parent = todosRef.value.find((item) => item.id === options.parent_id)
        if (parent) parent.child_ids = [...parent.child_ids, id]
      }
      return { success: true, data: todo }
    }),
    updateTodo: vi.fn(async (id, updates) => {
      const index = todosRef.value.findIndex((item) => item.id === id)
      if (index === -1) return { success: false, error: '任务不存在' }
      todosRef.value[index] = { ...todosRef.value[index], ...updates }
      return { success: true, data: todosRef.value[index] }
    }),
    deleteTodo: vi.fn(async () => ({ success: true })),
    deleteCompletedTodos: vi.fn(async () => ({ success: true, count: 2 })),
    restoreTodo: vi.fn(async () => ({ success: true })),
    permanentDeleteTodo: vi.fn(async () => ({ success: true })),
    emptyTrash: vi.fn(async () => ({ success: true }))
  }
}

const makeScheduleStore = (initial = []) => {
  const schedulesRef = ref([...initial])
  return {
    get schedules() {
      return schedulesRef.value
    },
    isFetched: true,
    fetchSchedules: vi.fn(async () => {}),
    createSchedules: vi.fn(async (events) => {
      const created = events.map((event, index) => ({
        id: 100 + index,
        title: event.title,
        notes: event.notes ?? null,
        start_at: event.start_at,
        end_at: event.end_at,
        todo_id: event.todo_id ?? null
      }))
      schedulesRef.value = [...schedulesRef.value, ...created]
      return { success: true, data: created }
    }),
    updateSchedule: vi.fn(async (id, updates) => {
      const index = schedulesRef.value.findIndex((item) => item.id === id)
      if (index === -1) return { success: false, error: '日程不存在' }
      schedulesRef.value[index] = { ...schedulesRef.value[index], ...updates }
      return { success: true, data: schedulesRef.value[index] }
    }),
    deleteSchedule: vi.fn(async (id) => {
      schedulesRef.value = schedulesRef.value.filter((item) => item.id !== id)
      return { success: true }
    })
  }
}

describe('createAgentToolRunner', () => {
  let todoStore
  let scheduleStore
  let runner

  beforeEach(() => {
    nextTempId = -1
    todoStore = makeTodoStore([
      createTodoRow({ id: 1, title: '根任务', child_ids: [2], sort_order: 1 }),
      createTodoRow({ id: 2, title: '子任务', child_ids: [3], deadline: '2026-11-01T10:00:00Z' }),
      createTodoRow({ id: 3, title: '孙任务', completed_at: '2026-11-02T10:00:00Z' }),
      createTodoRow({ id: 4, title: '另一个根任务', sort_order: 2 })
    ])
    scheduleStore = makeScheduleStore([
      { id: 9, title: '评审会', notes: null, start_at: '2026-11-10T07:00:00Z', end_at: '2026-11-10T08:00:00Z', todo_id: null }
    ])
    runner = createAgentToolRunner({
      todoStore,
      scheduleStore,
      authStore: { user: { id: 'user-1' } }
    })
  })

  it('列出任务时带出完整路径与父任务', async () => {
    const result = await runner.run('list_todos', { completed: 'all' })

    expect(result.ok).toBe(true)
    expect(result.matching).toBe(4)
    const grandChild = result.tasks.find((task) => task.id === 3)
    expect(grandChild.path).toBe('根任务 / 子任务 / 孙任务')
    expect(grandChild.parent_id).toBe(2)
    expect(grandChild.completed).toBe(true)
  })

  it('默认只看未完成任务，并支持关键词筛选', async () => {
    const active = await runner.run('list_todos', {})
    expect(active.tasks.map((task) => task.id)).toEqual([1, 2, 4])

    const search = await runner.run('list_todos', { query: '孙' })
    expect(search.tasks).toHaveLength(0)

    const searchAll = await runner.run('list_todos', { query: '孙', completed: 'all' })
    expect(searchAll.tasks).toHaveLength(1)
  })

  it('一次性创建任务与子任务并挂到父节点', async () => {
    const result = await runner.run('create_todo', {
      title: '准备季度汇报',
      parent_id: 1,
      difficulty: 3,
      subtasks: [{ title: '收集数据' }, { title: '写提纲' }]
    })

    expect(result.ok).toBe(true)
    expect(result.subtasks).toHaveLength(2)
    const parent = todoStore.todos.find((item) => item.id === 1)
    expect(parent.child_ids).toContain(result.task.id)
    const created = todoStore.todos.find((item) => item.id === result.task.id)
    expect(created.child_ids).toEqual(result.subtasks.map((task) => task.id))
  })

  it('更新任务时允许清空截止时间', async () => {
    const result = await runner.run('update_todo', { id: 2, deadline: null })

    expect(result.ok).toBe(true)
    expect(result.task.deadline).toBeNull()
    expect(todoStore.todos.find((item) => item.id === 2).deadline).toBeNull()
  })

  it('拒绝把任务移动到自己的后代下', async () => {
    const result = await runner.run('move_todo', { id: 1, new_parent_id: 3 })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('子任务')
    expect(todoStore.updateTodo).not.toHaveBeenCalled()
  })

  it('移动任务时同步维护新旧父节点的子列表', async () => {
    const result = await runner.run('move_todo', { id: 2, new_parent_id: 4 })

    expect(result.ok).toBe(true)
    expect(todoStore.todos.find((item) => item.id === 1).child_ids).not.toContain(2)
    expect(todoStore.todos.find((item) => item.id === 4).child_ids).toContain(2)
  })

  it('批量完成时跳过已完成任务并汇总失败项', async () => {
    const result = await runner.run('complete_todo', { ids: [1, 3, 999], completed: true })

    expect(result.ok).toBe(true)
    expect(result.updated.map((item) => item.id)).toEqual([1])
    expect(result.unchanged.map((item) => item.id)).toEqual([3])
    expect(result.failed).toHaveLength(1)
    expect(todoStore.todos.find((item) => item.id === 1).completed_at).toBeTruthy()
  })

  it('未提供任务 id 时提示需要 id 或 ids', async () => {
    const result = await runner.run('complete_todo', { completed: true })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('ids')
  })

  it('链接任务时保留原有父任务，重复链接不重复写入', async () => {
    const linked = await runner.run('link_todo', { parent_id: 4, child_id: 2 })
    expect(linked.ok).toBe(true)
    expect(todoStore.todos.find((item) => item.id === 4).child_ids).toContain(2)
    expect(todoStore.todos.find((item) => item.id === 1).child_ids).toContain(2)

    const listed = await runner.run('list_todos', { completed: 'all' })
    expect(listed.tasks.find((task) => task.id === 2).parent_ids).toEqual([1, 4])

    const again = await runner.run('link_todo', { parent_id: 1, child_id: 2 })
    expect(again.unchanged).toBe(true)
    expect(todoStore.updateTodo).toHaveBeenCalledTimes(1)
  })

  it('取消链接只移除父任务引用，任务本身保留', async () => {
    const result = await runner.run('unlink_todo', { parent_id: 1, child_id: 2 })

    expect(result.ok).toBe(true)
    expect(todoStore.todos.find((item) => item.id === 1).child_ids).not.toContain(2)
    expect(todoStore.todos.find((item) => item.id === 2)).toBeTruthy()
  })

  it('拒绝把任务链接到自己', async () => {
    const result = await runner.run('link_todo', { parent_id: 1, child_id: 1 })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('自己')
    expect(todoStore.updateTodo).not.toHaveBeenCalled()
  })

  it('创建日程时校验时间顺序', async () => {
    const invalid = await runner.run('create_schedule', {
      title: '倒序日程',
      start_at: '2026-11-10T09:00:00Z',
      end_at: '2026-11-10T08:00:00Z'
    })
    expect(invalid.ok).toBe(false)
    expect(scheduleStore.createSchedules).not.toHaveBeenCalled()

    const valid = await runner.run('create_schedule', {
      title: '晨会',
      start_at: '2026-11-10T01:00:00Z',
      end_at: '2026-11-10T02:00:00Z'
    })
    expect(valid.ok).toBe(true)
    expect(valid.schedule.id).toBe(100)
  })

  it('破坏性工具集中声明，交由界面确认', () => {
    expect([...DESTRUCTIVE_TOOLS]).toEqual([
      'delete_todo',
      'delete_completed_todos',
      'permanent_delete_todo',
      'empty_trash'
    ])
  })
})
