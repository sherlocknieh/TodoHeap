import { describe, expect, it } from 'vitest'
import { summarizeRequest } from './contextStats'

describe('summarizeRequest', () => {
  it('按上下文四类拆分字符数并估算 token', () => {
    const stats = summarizeRequest({
      messages: [
        { role: 'system', content: 'abcd' },
        { role: 'user', content: 'ef' },
        { role: 'assistant', content: 'gh', tool_calls: [{ function: { arguments: 'ijk' } }] },
        { role: 'tool', content: 'lmnop' }
      ]
    })

    expect(stats.system).toBe(4)
    expect(stats.tools).toBe(0)
    expect(stats.messages).toBe(7)
    expect(stats.toolOutput).toBe(5)
    expect(stats.total).toBe(16)
    expect(stats.tokens).toBe(6)
  })

  it('思考内容计入对话消息', () => {
    const stats = summarizeRequest({
      messages: [
        { role: 'assistant', content: 'ab', reasoning_content: '思考' }
      ]
    })
    expect(stats.messages).toBe(4)
  })

  it('工具定义计入可用工具', () => {
    const stats = summarizeRequest({
      messages: [{ role: 'user', content: 'hi' }],
      body: { tools: [{ type: 'function' }] }
    })

    expect(stats.tools).toBe(JSON.stringify([{ type: 'function' }]).length)
    expect(stats.messages).toBe(2)
  })

  it('没有请求或消息时返回 null', () => {
    expect(summarizeRequest(null)).toBeNull()
    expect(summarizeRequest({})).toBeNull()
    expect(summarizeRequest({ messages: [] })).toEqual({
      system: 0,
      tools: 0,
      messages: 0,
      toolOutput: 0,
      total: 0,
      tokens: 0
    })
  })
})
