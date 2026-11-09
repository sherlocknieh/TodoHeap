import { describe, expect, it } from 'vitest'
import { summarizeRequest } from './contextStats'

describe('summarizeRequest', () => {
  it('按角色拆分字符数并估算 token', () => {
    const stats = summarizeRequest({
      messages: [
        { role: 'system', content: 'abcd' },
        { role: 'user', content: 'ef' },
        { role: 'assistant', content: 'gh', tool_calls: [{ function: { arguments: 'ijk' } }] },
        { role: 'tool', content: 'lmnop' }
      ]
    })

    expect(stats.system).toBe(4)
    expect(stats.history).toBe(7)
    expect(stats.tools).toBe(5)
    expect(stats.total).toBe(16)
    expect(stats.tokens).toBe(6)
  })

  it('没有请求或消息时返回 null', () => {
    expect(summarizeRequest(null)).toBeNull()
    expect(summarizeRequest({})).toBeNull()
    expect(summarizeRequest({ messages: [] })).toEqual({
      system: 0,
      history: 0,
      tools: 0,
      total: 0,
      tokens: 0
    })
  })
})
