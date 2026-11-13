import { describe, expect, it, vi } from 'vitest'

const supabase = { auth: { getSession: vi.fn() } }

vi.mock('@/lib/supabase', () => ({
  supabase,
  supabaseUrl: 'https://example.supabase.co',
  supabasePubKey: 'anon-key'
}))

const {
  buildMcpToolDefinitions,
  createMcpServerFromPreset,
  findMcpPreset,
  findPresetServer,
  isTokenFresh,
  MCP_PRESETS,
  findMcpServerForTool,
  isMcpReadOnlyTool,
  isMcpToolName,
  mcpToolLabel,
  mcpToolName,
  normalizeMcpServer,
  normalizeMcpServers,
  readMcpToolResult
} = await import('./mcpServers')

const server = (overrides = {}) => ({
  id: 'mcp_1',
  name: '高德地图',
  endpoint: 'https://example.com/mcp',
  token: '',
  enabled: true,
  tools: [],
  error: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
})

describe('normalizeMcpServer', () => {
  it('缺名称或地址时丢弃，保留启用状态与工具', () => {
    expect(normalizeMcpServer({ name: '', endpoint: 'https://a.com' })).toBeNull()
    expect(normalizeMcpServer({ name: '服务' })).toBeNull()

    const parsed = normalizeMcpServer({ name: '服务', endpoint: 'https://a.com' })
    expect(parsed.enabled).toBe(true)
    expect(parsed.token).toBe('')
    expect(parsed.tools).toEqual([])
  })

  it('显式 disabled 保留，重复 id 只取第一个', () => {
    const list = normalizeMcpServers([
      { id: 'a', name: 'A', endpoint: 'https://a.com', enabled: false },
      { id: 'a', name: 'A2', endpoint: 'https://b.com' }
    ])
    expect(list).toHaveLength(1)
    expect(list[0].enabled).toBe(false)
  })
})

describe('内置预设', () => {
  it('滴答清单预设自带固定地址', () => {
    const preset = findMcpPreset('dida')
    expect(preset).toMatchObject({ name: '滴答清单', endpoint: 'https://mcp.dida365.com/', requiresDidaAuth: true })
    expect(MCP_PRESETS.map((item) => item.id)).toEqual(['dida'])
    expect(findMcpPreset('unknown')).toBeNull()
  })

  it('预设展开成服务配置时带上 presetId 与令牌', () => {
    const server = createMcpServerFromPreset(findMcpPreset('dida'), { token: 'token-1' })
    expect(server).toMatchObject({
      presetId: 'dida',
      name: '滴答清单',
      endpoint: 'https://mcp.dida365.com/',
      token: 'token-1',
      enabled: true
    })
    expect(createMcpServerFromPreset(null)).toBeNull()
  })

  it('能识别已添加的预设，手填服务不受影响', () => {
    const list = [server({ id: 'a' }), server({ id: 'b', presetId: 'dida' })]
    expect(findPresetServer(list, 'dida')?.id).toBe('b')
    expect(findPresetServer(list, 'other')).toBeNull()
  })

  it('令牌快过期时视为需要重新授权', () => {
    expect(isTokenFresh({ accessToken: 't', expiresAt: Date.now() + 10 * 60 * 1000 })).toBe(true)
    expect(isTokenFresh({ accessToken: 't', expiresAt: Date.now() + 10 * 1000 })).toBe(false)
    expect(isTokenFresh({ accessToken: 't', expiresAt: 0 })).toBe(true)
    expect(isTokenFresh(null)).toBe(false)
  })
})

describe('mcpToolName', () => {
  it('服务名转 slug 后拼成带前缀的工具名', () => {
    expect(mcpToolName({ name: 'Gaode Map' }, 'search_place')).toBe('mcp__gaode_map__search_place')
    expect(mcpToolName({ name: '高德地图' }, 'search')).toBe('mcp__server__search')
    expect(isMcpToolName('mcp__x__y')).toBe(true)
    expect(isMcpToolName('list_todos')).toBe(false)
  })

  it('能按工具名反查服务并还原展示文案', () => {
    const list = [server({ name: '高德地图' })]
    const name = mcpToolName(list[0], 'search_place')
    expect(findMcpServerForTool(list, name)).toBe(list[0])
    expect(findMcpServerForTool(list, 'mcp__other__x')).toBeNull()
    expect(mcpToolLabel(name)).toBe('server / search_place')
  })
})

describe('buildMcpToolDefinitions', () => {
  it('只导出启用服务的工具，schema 统一成 object', () => {
    const definitions = buildMcpToolDefinitions([
      server({
        name: 'Weather',
        tools: [
          { name: 'forecast', description: '查天气', inputSchema: { type: 'object', required: ['city'], properties: { city: { type: 'string' } } } },
          { name: 'echo', description: '', inputSchema: null }
        ]
      }),
      server({ id: 'mcp_2', name: 'Off', enabled: false, tools: [{ name: 'hidden' }] })
    ])

    expect(definitions).toHaveLength(2)
    expect(definitions[0].function.name).toBe('mcp__weather__forecast')
    expect(definitions[0].function.parameters.properties.city).toEqual({ type: 'string' })
    expect(definitions[1].function.parameters).toEqual({ type: 'object', properties: {} })
    expect(definitions.some((item) => item.function.name.includes('hidden'))).toBe(false)
  })

  it('未声明只读的工具不算只读', () => {
    const list = [server({ name: 'Weather', tools: [{ name: 'forecast' }, { name: 'set_city', readOnly: true }] })]
    expect(isMcpReadOnlyTool(list, mcpToolName(list[0], 'forecast'))).toBe(false)
    expect(isMcpReadOnlyTool(list, mcpToolName(list[0], 'set_city'))).toBe(true)
    expect(isMcpReadOnlyTool(list, 'list_todos')).toBe(false)
  })
})

describe('readMcpToolResult', () => {
  it('优先返回结构化内容，其次拼接文本块', () => {
    expect(readMcpToolResult({ result: { structuredContent: { ok: 1 } } })).toEqual({ ok: 1 })
    expect(readMcpToolResult({
      result: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }
    })).toBe('a\nb')
  })

  it('isError 与 JSON-RPC error 都抛错', () => {
    expect(() => readMcpToolResult({ result: { isError: true, content: [{ type: 'text', text: '失败' }] } }))
      .toThrow('失败')
    expect(() => readMcpToolResult({ error: { message: '服务不可用' } })).toThrow('服务不可用')
    expect(() => readMcpToolResult(null)).toThrow('没有返回内容')
  })
})

describe('MCP 调用链', () => {
  it('先握手再列举工具，调用时带会话头并解析结果', async () => {
    const { callMcpTool, listMcpTools } = await import('./mcpServers')
    const calls = []
    const responses = [
      { payload: { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }, sessionId: 'sess-1' },
      { payload: null },
      { payload: { jsonrpc: '2.0', id: 2, result: { tools: [
        { name: 'forecast', description: '查天气', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { city: { type: 'string' } } } }
      ], nextCursor: '' } } },
      { payload: { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: '晴' }] } } }
    ]

    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
    globalThis.fetch = vi.fn(async (url, options) => {
      calls.push({ url, options })
      const next = responses.shift()
      return {
        ok: true,
        json: async () => next
      }
    })

    const target = server({ id: 'mcp_e2e', name: 'Weather', endpoint: 'https://weather.test/mcp' })
    const tools = await listMcpTools(target)
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ name: 'forecast', readOnly: true })

    // 握手拿到的会话头要带回后续请求
    expect(JSON.parse(calls[2].options.body).sessionId).toBe('sess-1')

    const result = await callMcpTool({ server: target, toolName: 'forecast', args: { city: '杭州' } })
    expect(result).toBe('晴')

    const payloads = calls.map((call) => JSON.parse(call.options.body))
    expect(payloads.map((body) => body.rpc.method)).toEqual([
      'initialize', 'notifications/initialized', 'tools/list', 'tools/call'
    ])
    expect(JSON.parse(calls[3].options.body).rpc.params).toEqual({ name: 'forecast', arguments: { city: '杭州' } })
  })

  it('所有服务统一走 mcp_gateway，滴答也只传 endpoint 与令牌', async () => {
    const { listMcpTools } = await import('./mcpServers')
    const calls = []
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
    globalThis.fetch = vi.fn(async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      return { ok: true, json: async () => ({ payload: { result: { tools: [] } } }) }
    })

    await listMcpTools(server({ id: 'mcp_dida', presetId: 'dida', endpoint: 'https://mcp.dida365.com/', token: 'tk' }))
    await listMcpTools(server({ id: 'mcp_other', name: 'Other' }))

    expect(calls.every((call) => call.url.includes('/mcp_gateway'))).toBe(true)
    expect(calls[0].body).toMatchObject({ endpoint: 'https://mcp.dida365.com/', token: 'tk' })
    expect(calls.find((call) => call.body.endpoint === 'https://example.com/mcp')).toBeTruthy()
  })

  it('网络层失败时提示网关未部署', async () => {
    const { listMcpTools } = await import('./mcpServers')
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(listMcpTools(server({ id: 'mcp_net' })))
      .rejects.toThrow('请确认边缘函数 mcp_gateway 已部署')
  })

  it('网关报错时抛出可读原因', async () => {
    const { listMcpTools } = await import('./mcpServers')
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'MCP 服务鉴权失败，请检查令牌', unauthorized: true })
    }))

    await expect(listMcpTools(server({ id: 'mcp_bad' }))).rejects.toThrow('鉴权失败')
  })
})
