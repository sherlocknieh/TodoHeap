import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LLM_CONFIG,
  createStreamAccumulator,
  fetchGatewayModels,
  normalizeLlmConfig,
  resolveChatUrl,
  streamChatCompletion
} from './llmProvider'

describe('resolveChatUrl', () => {
  it('补全 /chat/completions 路径', () => {
    expect(resolveChatUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('保留已经完整的地址', () => {
    expect(resolveChatUrl('http://localhost:11434/v1/chat/completions'))
      .toBe('http://localhost:11434/v1/chat/completions')
  })

  it('缺少地址时抛出可读错误', () => {
    expect(() => resolveChatUrl('')).toThrow('Base URL')
  })
})

describe('normalizeLlmConfig', () => {
  it('未知预设归为自定义并保留用户输入', () => {
    const config = normalizeLlmConfig({ presetId: 'unknown', baseUrl: ' https://example.com/v1 ', model: 'demo' })
    expect(config.presetId).toBe('custom')
    expect(config.baseUrl).toBe('https://example.com/v1')
    expect(config.model).toBe('demo')
  })

  it('空配置回落为默认值', () => {
    expect(normalizeLlmConfig(null)).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('温度限制在 0 到 2 之间', () => {
    expect(normalizeLlmConfig({ temperature: 9 }).temperature).toBe(2)
    expect(normalizeLlmConfig({ temperature: -1 }).temperature).toBe(0)
  })

  it('默认使用自带密钥模式', () => {
    expect(normalizeLlmConfig({ baseUrl: 'https://api.example.com/v1', model: 'demo' }).mode).toBe('byok')
  })

  it('内置模式使用独立的内置模型字段', () => {
    const config = normalizeLlmConfig({ mode: 'builtin', model: 'byok-model', builtinModel: 'deepseek-chat' })
    expect(config.mode).toBe('builtin')
    expect(config.builtinModel).toBe('deepseek-chat')
    expect(config.model).toBe('byok-model')
  })

  it('内置模型缺省时留空，等待网关返回可用列表', () => {
    expect(normalizeLlmConfig({ mode: 'builtin' }).builtinModel).toBe('')
  })
})

describe('fetchGatewayModels', () => {
  it('用 GET 读取网关返回的模型列表', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ models: ['deepseek-flash', 'deepseek-chat'], source: 'upstream' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await fetchGatewayModels({
        endpoint: 'https://example.supabase.co/functions/v1/llm_gateway',
        apiKey: 'user-jwt',
        extraHeaders: { apikey: 'publishable-key' }
      })

      expect(result.models).toEqual(['deepseek-flash', 'deepseek-chat'])
      expect(result.warning).toBe('')
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://example.supabase.co/functions/v1/llm_gateway')
      expect(init.method).toBe('GET')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer user-jwt',
        apikey: 'publishable-key'
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('网关无法列出模型时返回 warning，供界面退回手动输入', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ models: [], source: 'unavailable', warning: '请手动填写模型名' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await fetchGatewayModels({ endpoint: 'https://example.com/gateway', apiKey: 'jwt' })
      expect(result.models).toEqual([])
      expect(result.warning).toBe('请手动填写模型名')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('streamChatCompletion', () => {
  it('指定 endpoint 时直接使用，并透传额外请求头', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await streamChatCompletion({
        endpoint: 'https://example.supabase.co/functions/v1/llm_gateway',
        apiKey: 'user-jwt',
        extraHeaders: { apikey: 'publishable-key' },
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }]
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://example.supabase.co/functions/v1/llm_gateway')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer user-jwt',
        apikey: 'publishable-key'
      })
      expect(result.content).toBe('ok')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('createStreamAccumulator', () => {
  it('拼接文本增量并透传', () => {
    const accumulator = createStreamAccumulator()
    expect(accumulator.pushContent('你')).toBe('你')
    expect(accumulator.pushContent('好')).toBe('好')
    expect(accumulator.result().content).toBe('你好')
  })

  it('按 index 合并分片的工具调用参数', () => {
    const accumulator = createStreamAccumulator()
    accumulator.pushToolCalls([
      { index: 0, id: 'call_1', function: { name: 'create_todo', arguments: '{"ti' } }
    ])
    accumulator.pushToolCalls([
      { index: 0, function: { arguments: 'tle":"写周报"}' } },
      { index: 1, id: 'call_2', function: { name: 'list_todos', arguments: '{}' } }
    ])

    const result = accumulator.result()
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'create_todo', arguments: '{"title":"写周报"}' }
    })
    expect(result.toolCalls[1].function.name).toBe('list_todos')
  })

  it('缺少 id 的调用会补一个稳定可用的标识', () => {
    const accumulator = createStreamAccumulator()
    accumulator.pushToolCalls([{ index: 0, function: { name: 'list_todos', arguments: '{}' } }])
    expect(accumulator.result().toolCalls[0].id).toMatch(/^call_/)
  })

  it('忽略没有函数名的空调用', () => {
    const accumulator = createStreamAccumulator()
    accumulator.pushToolCalls([{ index: 0, function: { arguments: '{}' } }])
    expect(accumulator.result().toolCalls).toHaveLength(0)
  })
})
