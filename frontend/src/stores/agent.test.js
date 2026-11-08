import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  stores: { todo: null, schedule: null, auth: null }
}))

vi.mock('./llm', () => ({
  useLlmStore: () => ({
    isConfigured: true,
    config: { model: 'test-model' },
    chat: mocks.chat
  })
}))
vi.mock('./todos', () => ({ useTodoStore: () => mocks.stores.todo }))
vi.mock('./schedules', () => ({ useScheduleStore: () => mocks.stores.schedule }))
vi.mock('./auth', () => ({ useAuthStore: () => mocks.stores.auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useAgentStore } from './agent'

let nextId

const makeTodoStore = () => {
  const todos = [
    { id: 1, title: '写周报', child_ids: [], completed_at: null, deleted_at: null }
  ]
  return {
    todos,
    trashTodos: [],
    isFetched: true,
    fetchTodos: vi.fn(async () => {}),
    fetchTrash: vi.fn(async () => {}),
    addTodo: mocks.addTodo,
    updateTodo: mocks.updateTodo,
    deleteTodo: mocks.deleteTodo,
    deleteCompletedTodos: vi.fn(async () => ({ success: true, count: 0 })),
    restoreTodo: vi.fn(async () => ({ success: true })),
    permanentDeleteTodo: vi.fn(async () => ({ success: true })),
    emptyTrash: vi.fn(async () => ({ success: true }))
  }
}

const toolCallResponse = (name, args) => ({
  content: '',
  tool_calls: [{
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }]
})

describe('useAgentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.chat.mockReset()
    mocks.addTodo.mockReset()
    mocks.updateTodo.mockReset()
    mocks.deleteTodo.mockReset()
    nextId = -1

    mocks.addTodo.mockImplementation(async (title, options = {}) => ({
      success: true,
      data: { id: nextId--, title, ...options }
    }))
    mocks.updateTodo.mockImplementation(async (id, updates) => ({
      success: true,
      data: { id, ...updates }
    }))
    mocks.deleteTodo.mockImplementation(async () => ({ success: true }))

    mocks.stores.todo = makeTodoStore()
    mocks.stores.schedule = {
      schedules: [],
      isFetched: true,
      fetchSchedules: vi.fn(async () => {}),
      createSchedules: vi.fn(async () => ({ success: true, data: [] })),
      updateSchedule: vi.fn(async () => ({ success: true, data: {} })),
      deleteSchedule: vi.fn(async () => ({ success: true }))
    }
    mocks.stores.auth = { user: { id: 'user-1' } }
  })

  it('执行工具调用后继续对话并给出总结', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('create_todo', { title: '写季度总结', difficulty: 2 }))
      .mockResolvedValueOnce({ content: '已创建「写季度总结」。', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('帮我建一个写季度总结的任务')

    expect(mocks.chat).toHaveBeenCalledTimes(2)
    expect(mocks.addTodo).toHaveBeenCalledWith('写季度总结', expect.objectContaining({ difficulty: 2 }))

    const [, assistantWithTool, finalAssistant] = agent.messages
    expect(assistantWithTool.role).toBe('assistant')
    expect(assistantWithTool.toolCalls[0].status).toBe('success')
    expect(assistantWithTool.toolCalls[0].result.ok).toBe(true)
    expect(finalAssistant.content).toBe('已创建「写季度总结」。')
    expect(agent.running).toBe(false)
  })

  it('第二次请求会带上工具结果，保证模型能继续推理', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('list_todos', {}))
      .mockResolvedValueOnce({ content: '你有 1 条任务。', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('我有哪些任务')

    const secondCallMessages = mocks.chat.mock.calls[1][0].messages
    expect(secondCallMessages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_list_todos' })
    expect(secondCallMessages.some((message) => message.role === 'assistant' && message.tool_calls)).toBe(true)
  })

  it('破坏性操作先等待确认，取消后不执行并让模型收尾', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('delete_todo', { id: 1 }))
      .mockResolvedValueOnce({ content: '已取消删除。', tool_calls: [] })

    const agent = useAgentStore()
    const pending = agent.send('删除写周报')

    await vi.waitFor(() => expect(agent.pendingApproval).not.toBeNull())
    expect(agent.pendingApproval.name).toBe('delete_todo')
    expect(mocks.deleteTodo).not.toHaveBeenCalled()

    agent.resolveApproval(false)
    await pending

    expect(mocks.deleteTodo).not.toHaveBeenCalled()
    const toolMessage = agent.messages[1]
    expect(toolMessage.toolCalls[0].status).toBe('cancelled')
    expect(toolMessage.toolCalls[0].result.cancelled).toBe(true)
    expect(agent.messages.at(-1).content).toBe('已取消删除。')
  })

  it('确认后执行破坏性操作', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('delete_todo', { id: 1 }))
      .mockResolvedValueOnce({ content: '已删除。', tool_calls: [] })

    const agent = useAgentStore()
    const pending = agent.send('删除写周报')

    await vi.waitFor(() => expect(agent.pendingApproval).not.toBeNull())
    agent.resolveApproval(true)
    await pending

    expect(mocks.deleteTodo).toHaveBeenCalledWith(1)
    expect(agent.messages[1].toolCalls[0].status).toBe('success')
  })

  it('支持新建、切换、重命名与删除会话', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '你好', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('第一句')

    const firstId = agent.activeSessionId
    expect(agent.activeSession.title).toBe('第一句')
    expect(agent.messages).toHaveLength(2)

    const secondId = agent.newSession()
    expect(agent.activeSessionId).toBe(secondId)
    expect(agent.messages).toHaveLength(0)
    expect(agent.sessions).toHaveLength(2)

    agent.renameSession(secondId, '第二个会话')
    expect(agent.sessions.find((session) => session.id === secondId).title).toBe('第二个会话')

    agent.switchSession(firstId)
    expect(agent.activeSession.title).toBe('第一句')
    expect(agent.messages).toHaveLength(2)

    agent.deleteSession(firstId)
    expect(agent.sessions.map((session) => session.id)).toEqual([secondId])
    expect(agent.activeSessionId).toBe(secondId)
    expect(agent.messages).toHaveLength(0)
  })

  it('清空当前会话不会删除其他会话', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '好的', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('第一句')
    const firstId = agent.activeSessionId
    const secondId = agent.newSession()

    agent.switchSession(firstId)
    agent.clear()
    expect(agent.messages).toHaveLength(0)
    expect(agent.sessions).toHaveLength(2)

    agent.switchSession(secondId)
    expect(agent.messages).toHaveLength(0)
    expect(agent.sessions.find((session) => session.id === firstId).messages).toHaveLength(0)
  })

  it('内置全局优化会新建会话并发送固定指令', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '已优化', tool_calls: [] })

    const agent = useAgentStore()
    const result = await agent.optimizeTasks()

    expect(result).toBe(true)
    expect(agent.activeSession.title).toBe('全局任务优化')
    expect(agent.messages[0]).toMatchObject({ role: 'user' })
    expect(agent.messages[0].content).toContain('全局优化')
    expect(agent.messages.at(-1).content).toBe('已优化')
    expect(mocks.chat).toHaveBeenCalledTimes(1)
  })

  it('已有消息时会为全局优化新建会话', async () => {
    mocks.chat
      .mockResolvedValueOnce({ content: '旧会话回复', tool_calls: [] })
      .mockResolvedValueOnce({ content: '已优化', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('旧话题')
    const previousId = agent.activeSessionId

    await agent.optimizeTasks()

    expect(agent.activeSessionId).not.toBe(previousId)
    expect(agent.sessions.find((session) => session.id === previousId).messages).toHaveLength(2)
  })

  it('模型调用失败时暴露可读错误并复位运行状态', async () => {
    mocks.chat.mockRejectedValueOnce(new Error('模型接口返回 401：invalid api key'))

    const agent = useAgentStore()
    await agent.send('你好')

    expect(agent.error).toContain('401')
    expect(agent.running).toBe(false)
  })
})
