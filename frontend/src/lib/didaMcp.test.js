import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  supabaseUrl: 'https://example.supabase.co',
  supabasePubKey: 'anon-key'
}))

const {
  buildDidaAuthorizeUrl,
  buildDidaImport,
  pickArray,
  readToolPayload
} = await import('./didaMcp')

describe('buildDidaAuthorizeUrl', () => {
  it('拼出带 PKCE 与资源标识的授权地址', () => {
    const url = new URL(buildDidaAuthorizeUrl({
      clientId: 'client-1',
      redirectUri: 'https://example.com/TodoHeap/',
      challenge: 'challenge-1',
      state: 'state-1'
    }))

    expect(url.origin).toBe('https://dida365.com')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/TodoHeap/')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('resource')).toBe('https://mcp.dida365.com/')
  })
})

describe('readToolPayload', () => {
  it('解析文本内容里的 JSON', () => {
    const payload = {
      result: { content: [{ type: 'text', text: '[{"id":"1","title":"写周报"}]' }] }
    }
    expect(readToolPayload(payload)).toEqual([{ id: '1', title: '写周报' }])
  })

  it('兼容代码块包裹的 JSON', () => {
    const payload = {
      result: { content: [{ type: 'text', text: '结果：\n```json\n{"tasks":[]}\n```' }] }
    }
    expect(readToolPayload(payload)).toEqual({ tasks: [] })
  })

  it('优先使用结构化内容', () => {
    const payload = {
      result: {
        structuredContent: { tasks: [{ id: '2' }] },
        content: [{ type: 'text', text: '{}' }]
      }
    }
    expect(readToolPayload(payload)).toEqual({ tasks: [{ id: '2' }] })
  })

  it('工具报错时抛出可读信息', () => {
    expect(() => readToolPayload({ error: { message: '无效令牌' } })).toThrow('无效令牌')
    expect(() => readToolPayload({
      result: { isError: true, content: [{ type: 'text', text: '请求被拒绝' }] }
    })).toThrow('请求被拒绝')
  })
})

describe('pickArray', () => {
  it('直接返回数组', () => {
    expect(pickArray([{ id: '1' }])).toEqual([{ id: '1' }])
  })

  it('按候选字段取数组', () => {
    expect(pickArray({ tasks: [{ id: '1' }] })).toEqual([{ id: '1' }])
    expect(pickArray({ data: { items: [{ id: '2' }] } }, ['items'])).toEqual([{ id: '2' }])
  })

  it('取不到时返回空数组', () => {
    expect(pickArray(null)).toEqual([])
    expect(pickArray({ message: 'ok' })).toEqual([])
  })
})

describe('buildDidaImport', () => {
  const projects = [{ id: 'p1', name: '工作' }]

  it('把清单名写进任务并保留任务来源标识', () => {
    const result = buildDidaImport({
      projects,
      tasks: [{ id: 't1', projectId: 'p1', title: '写周报' }]
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].title).toBe('写周报')
    expect(result.tasks[0].listName).toBe('工作')
    expect(result.tasks[0].externalId).toBe('ticktick:t1')
  })

  it('按 childIds 还原父子层级', () => {
    const result = buildDidaImport({
      projects,
      tasks: [
        { id: 'parent', projectId: 'p1', title: '父任务', childIds: ['child'] },
        { id: 'child', projectId: 'p1', title: '子任务' }
      ]
    })

    const child = result.tasks.find((task) => task.title === '子任务')
    expect(child.parentKey).toBe('json:parent')
  })

  it('关闭已完成开关后过滤掉已完成任务', () => {
    const tasks = [
      { id: 'done', projectId: 'p1', title: '已完成', status: 2, completedTime: '2026-01-01T00:00:00+0800' },
      { id: 'todo', projectId: 'p1', title: '待办', status: 0 }
    ]

    expect(buildDidaImport({ projects, tasks, includeCompleted: false }).tasks.map((task) => task.title))
      .toEqual(['待办'])
    expect(buildDidaImport({ projects, tasks, includeCompleted: true }).tasks).toHaveLength(2)
  })
})
