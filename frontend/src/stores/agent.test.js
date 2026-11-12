import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
  stores: { todo: null, schedule: null, auth: null }
}))

vi.mock('./llm', () => ({
  useLlmStore: () => ({
    isConfigured: true,
    activeModel: 'test-model',
    config: { model: 'test-model', temperature: 0.2 },
    chat: mocks.chat
  })
}))
vi.mock('./todos', () => ({ useTodoStore: () => mocks.stores.todo }))
vi.mock('./schedules', () => ({ useScheduleStore: () => mocks.stores.schedule }))
vi.mock('./auth', () => ({ useAuthStore: () => mocks.stores.auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/agentImages', () => ({
  hydrateImages: vi.fn(async () => {}),
  removeStoredImages: vi.fn()
}))
vi.mock('@/lib/userSettings', () => ({
  fetchUserSettings: mocks.fetchUserSettings,
  saveUserSettings: mocks.saveUserSettings
}))

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
    mocks.fetchUserSettings.mockReset()
    mocks.saveUserSettings.mockReset()
    mocks.fetchUserSettings.mockResolvedValue({ success: true, data: {} })
    mocks.saveUserSettings.mockResolvedValue({ success: true, data: {} })
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

  it('在用户消息上记录每一轮实际发送给模型的完整请求', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('list_todos', {}))
      .mockResolvedValueOnce({
        content: '你有 1 条任务。',
        tool_calls: [],
        usage: { prompt: 120, completion: 30, total: 150 }
      })

    const agent = useAgentStore()
    await agent.send('我有哪些任务')

    const userMessage = agent.messages[0]
    expect(userMessage.requests).toHaveLength(2)

    const [first, second] = userMessage.requests
    expect(first.usage).toBeNull()
    expect(second.usage).toEqual({ prompt: 120, completion: 30, total: 150 })
    expect(first.model).toBe('test-model')
    expect(first.temperature).toBe(0.2)
    expect(first.messages[0]).toMatchObject({ role: 'system' })
    expect(first.tools).toContain('list_todos')
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_list_todos' })
    expect(second.tools).toEqual(first.tools)
    // 请求体快照与实际发送的协议字段一致，右栏据此展示参数
    expect(first.body).toMatchObject({ model: 'test-model', temperature: 0.2, stream: true, tool_choice: 'auto' })
    expect(first.body.tools.map((definition) => definition.function.name)).toEqual(first.tools)
    expect(first.body.messages).toEqual(first.messages)
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

  it('挂载技能只加入待发送列表，不写入输入框也不直接发送', () => {
    const agent = useAgentStore()
    expect(agent.useSkill('global-optimize')).toBe(true)

    expect(agent.attachedSkills.map((skill) => skill.id)).toEqual(['global-optimize'])
    expect(agent.draft).toBe('')
    expect(agent.messages).toHaveLength(0)
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it('重复挂载同一技能不会产生重复项，移除后清空', () => {
    const agent = useAgentStore()
    agent.useSkill('global-optimize')
    agent.useSkill('global-optimize')
    expect(agent.attachedSkills).toHaveLength(1)

    agent.detachSkill('global-optimize')
    expect(agent.attachedSkills).toHaveLength(0)
  })

  it('挂载的技能指令写进本轮系统提示，发送后清空', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '好的', tool_calls: [] })

    const agent = useAgentStore()
    agent.useSkill('global-optimize')
    await agent.send('开始吧')

    const system = mocks.chat.mock.calls[0][0].messages[0].content
    expect(system).toContain('全局任务优化')
    expect(system).toContain('全局优化')
    expect(agent.messages[0].skills).toHaveLength(1)
    expect(agent.attachedSkills).toHaveLength(0)
  })

  it('同步技能的新增、修改与删除到用户设置', async () => {
    const agent = useAgentStore()
    agent.init('user-1')
    await vi.waitFor(() => expect(agent.skillsLoading).toBe(false))

    const skill = agent.addSkill({ name: '周复盘', icon: 'chart', prompt: '总结本周完成的任务' })
    expect(agent.skills.some((item) => item.id === skill.id)).toBe(true)

    agent.updateSkill(skill.id, { name: '每周复盘' })
    expect(agent.skills.find((item) => item.id === skill.id).name).toBe('每周复盘')

    agent.deleteSkill(skill.id)
    expect(agent.skills.some((item) => item.id === skill.id)).toBe(false)

    await vi.waitFor(() => expect(mocks.saveUserSettings).toHaveBeenCalledTimes(3))
    expect(mocks.saveUserSettings).toHaveBeenCalledWith('user-1',
      expect.objectContaining({ skills: agent.skills }))
  })

  it('模型调用失败后自动重试一次', async () => {
    mocks.chat
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce({ content: '重试成功', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('你好')

    expect(mocks.chat).toHaveBeenCalledTimes(2)
    expect(agent.error).toBe('')
    expect(agent.messages.at(-1).content).toBe('重试成功')
  })

  it('重试仍失败时暴露可读错误并复位运行状态', async () => {
    mocks.chat.mockRejectedValue(new Error('模型接口返回 401：invalid api key'))

    const agent = useAgentStore()
    await agent.send('你好')

    expect(mocks.chat).toHaveBeenCalledTimes(2)
    expect(agent.error).toContain('401')
    expect(agent.running).toBe(false)
  })

  it('重新生成会丢弃最后一条回复并重新请求', async () => {
    mocks.chat
      .mockResolvedValueOnce({ content: '第一次回答', tool_calls: [] })
      .mockResolvedValueOnce({ content: '第二次回答', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('你好')
    expect(agent.messages.at(-1).content).toBe('第一次回答')

    await agent.regenerate()
    expect(mocks.chat).toHaveBeenCalledTimes(2)
    expect(agent.messages).toHaveLength(2)
    expect(agent.messages.at(-1).content).toBe('第二次回答')
  })

  it('编辑用户消息后截断后续内容并重新发送', async () => {
    mocks.chat
      .mockResolvedValueOnce({ content: '旧回答', tool_calls: [] })
      .mockResolvedValueOnce({ content: '新回答', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('旧问题')
    const userId = agent.messages[0].id

    await agent.editAndResend(userId, '新问题')
    expect(agent.messages).toHaveLength(2)
    expect(agent.messages[0].content).toBe('新问题')
    expect(agent.messages.at(-1).content).toBe('新回答')
  })

  it('删除单条消息只影响该条', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '回答', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('问题')
    agent.deleteMessage(agent.messages.at(-1).id)

    expect(agent.messages).toHaveLength(1)
    expect(agent.messages[0].role).toBe('user')
  })

  it('草稿按会话分别保存，切换会话时各自恢复', () => {
    const agent = useAgentStore()
    agent.init('user-1')
    const first = agent.activeSessionId

    agent.setDraft('第一个会话的草稿')
    const second = agent.newSession()
    expect(agent.draft).toBe('')

    agent.setDraft('第二个会话的草稿')
    agent.switchSession(first)
    expect(agent.draft).toBe('第一个会话的草稿')

    agent.switchSession(second)
    expect(agent.draft).toBe('第二个会话的草稿')
  })

  it('点选技能后切到它绑定的模式，工具集由模式决定', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '好的', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    const skill = agent.addSkill({ name: '只看任务', prompt: '列出全部任务', mode: 'list' })
    expect(skill.mode).toBe('list')

    agent.useSkill(skill.id)
    expect(agent.activeMode).toBe('list')
    await agent.send('列出全部任务')

    const tools = mocks.chat.mock.calls[0][0].tools.map((item) => item.function.name)
    expect(tools).toContain('create_todo')
    expect(tools).not.toContain('create_schedule')
  })

  it('带图片的消息按多模态格式发送，图片本体不落 localStorage', async () => {
    const store = new Map()
    globalThis.localStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key)
    }
    mocks.chat.mockResolvedValueOnce({ content: '看到了。', tool_calls: [] })

    const agent = useAgentStore()
    const image = { id: 'img-1', name: '截图.png', mime: 'image/png', width: 800, height: 600, size: 12, dataUrl: 'data:image/png;base64,AAA' }
    await agent.send('这张图里是什么任务？', [image])

    const sent = mocks.chat.mock.calls[0][0].messages.at(-1)
    expect(sent.role).toBe('user')
    expect(sent.content).toEqual([
      { type: 'text', text: '这张图里是什么任务？' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }
    ])
    expect(agent.messages[0].images).toHaveLength(1)

    const stored = JSON.parse(store.get('todoheap.agent.v2.user-1'))
    expect(stored.sessions[0].messages[0].images[0].dataUrl).toBeUndefined()
    delete globalThis.localStorage
  })

  it('只有图片没有文字时也能发送，并用图片对话作为标题', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '收到。', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('', [{ id: 'img-2', mime: 'image/png', dataUrl: 'data:image/png;base64,BBB' }])

    expect(mocks.chat).toHaveBeenCalledTimes(1)
    expect(agent.activeSession.title).toBe('图片对话')
    expect(mocks.chat.mock.calls[0][0].messages.at(-1).content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBB' } }
    ])
  })

  it('@ 引用的任务与日程写进系统提示，并随消息保存', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '截止时间是下周五。', tool_calls: [] })

    const agent = useAgentStore()
    await agent.send('这个任务什么时候截止？', [], [
      { key: 'todo:12', type: 'todo', id: 12, label: '修改简历' },
      { key: 'schedule:7', type: 'schedule', id: 7, label: '评审会', hint: '11-12 15:00' }
    ])

    const system = mocks.chat.mock.calls[0][0].messages[0]
    expect(system.role).toBe('system')
    expect(system.content).toContain('任务 id 12：修改简历')
    expect(system.content).toContain('日程 id 7：评审会（11-12 15:00）')
    expect(agent.messages[0].mentions).toHaveLength(2)
  })

  it('Plan 模式只发送只读工具与规划提示词', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '建议先拆成三步。', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    await agent.send('帮我规划一下季度汇报')

    const request = mocks.chat.mock.calls[0][0]
    const toolNames = request.tools.map((tool) => tool.function.name)
    expect(toolNames).toEqual(['list_todos', 'get_todo', 'list_trash', 'list_schedules', 'ask_user', 'switch_mode', 'list_app_settings'])
    expect(toolNames).not.toContain('create_todo')
    expect(request.messages[0].content).toContain('Plan 模式')
  })

  it('switch_mode 确认后本轮后续请求改用 Build 的完整工具集', async () => {
    // 方案文本与切换请求在同一条回复里发出，确认卡片随方案一起出现
    mocks.chat
      .mockResolvedValueOnce({
        ...toolCallResponse('switch_mode', { mode: 'build', reason: '需要新建日程' }),
        content: '计划如下：2026-11-13 15:00 评审会。'
      })
      .mockResolvedValueOnce({ content: '已切换。', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    const pending = agent.send('帮我建一条日程')

    await vi.waitFor(() => expect(agent.pendingApproval).not.toBeNull())
    expect(agent.pendingApproval.name).toBe('switch_mode')
    agent.resolveApproval(true)
    await pending

    expect(agent.activeMode).toBe('build')
    expect(agent.messages[1].content).toContain('计划如下')
    const secondTools = mocks.chat.mock.calls[1][0].tools.map((tool) => tool.function.name)
    expect(secondTools).toContain('create_schedule')
    expect(secondTools).toContain('create_todo')
  })

  it('ask_user 弹出选择面板，点选结果作为工具结果继续本轮', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('ask_user', {
        question: '按哪天创建？',
        options: ['11-13 15:00', '11-12 15:00']
      }))
      .mockResolvedValueOnce({ content: '已按 11-13 创建。', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    const pending = agent.send('建一条评审会')

    await vi.waitFor(() => expect(agent.pendingChoice).not.toBeNull())
    expect(agent.pendingChoice.question).toBe('按哪天创建？')
    expect(agent.pendingChoice.options).toEqual(['11-13 15:00', '11-12 15:00'])

    agent.resolveChoice('11-13 15:00')
    await pending

    const call = agent.messages[1].toolCalls[0]
    expect(call.status).toBe('success')
    expect(call.result.answer).toBe('11-13 15:00')
    const toolMessage = mocks.chat.mock.calls[1][0].messages.at(-1)
    expect(toolMessage.role).toBe('tool')
    expect(toolMessage.content).toContain('11-13 15:00')
  })

  it('跳过选择面板时把取消结果交回模型', async () => {
    mocks.chat
      .mockResolvedValueOnce(toolCallResponse('ask_user', { question: '选哪个？', options: ['A', 'B'] }))
      .mockResolvedValueOnce({ content: '那我先不动。', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    const pending = agent.send('随便')

    await vi.waitFor(() => expect(agent.pendingChoice).not.toBeNull())
    agent.resolveChoice(null)
    await pending

    const call = agent.messages[1].toolCalls[0]
    expect(call.status).toBe('cancelled')
    expect(call.result.cancelled).toBe(true)
  })

  it('工具清单作为 system 消息随请求发送', async () => {
    mocks.chat.mockResolvedValueOnce({ content: '好的', tool_calls: [] })

    const agent = useAgentStore()
    agent.init('user-1')
    await agent.send('列出任务')

    const messages = mocks.chat.mock.calls[0][0].messages
    const toolsMessage = messages.find((message) => message.role === 'system'
      && String(message.content).startsWith('本轮可用工具'))
    expect(toolsMessage).toBeTruthy()
    expect(toolsMessage.content).toContain('list_todos：查看任务')
    expect(toolsMessage.content).toContain('switch_mode：切换工作模式')
    // 主提示词仍是第一条 system，工具清单紧随其后
    expect(messages[0].content).toContain('你是 TodoHeap 的任务管理 Agent')
    expect(messages[1]).toBe(toolsMessage)
  })

  it('模式跟随会话，切换会话后恢复各自的模式', async () => {
    const agent = useAgentStore()
    agent.init('user-1')
    const first = agent.activeSessionId
    expect(agent.activeMode).toBe('plan')

    agent.setMode('build')
    expect(agent.activeMode).toBe('build')

    const second = agent.newSession()
    expect(agent.activeMode).toBe('plan')

    agent.switchSession(first)
    expect(agent.activeMode).toBe('build')
    agent.switchSession(second)
    expect(agent.activeMode).toBe('plan')
  })
})
