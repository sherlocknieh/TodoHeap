import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LLM_CONFIG,
  createStreamAccumulator,
  normalizeLlmConfig,
  resolveChatUrl
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
