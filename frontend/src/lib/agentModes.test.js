import { describe, expect, it } from 'vitest'
import {
  AGENT_MODES,
  DEFAULT_AGENT_MODE,
  MODE_SWITCH_TOOL,
  READ_ONLY_TOOLS,
  findAgentMode,
  isValidModeTools,
  resolveAllowedTools
} from './agentModes'

describe('agentModes', () => {
  it('模式配置里的工具名都真实存在', () => {
    expect(isValidModeTools()).toBe(true)
  })

  it('默认 Plan，Build 不限制工具，Plan 只给只读工具加切换入口', () => {
    expect(DEFAULT_AGENT_MODE).toBe('plan')
    expect(findAgentMode('build').tools).toBeNull()
    expect(findAgentMode('plan').tools).toEqual([...READ_ONLY_TOOLS, MODE_SWITCH_TOOL])
    expect(AGENT_MODES.map((mode) => mode.id)).toEqual(['plan', 'build'])
  })

  it('未知模式回退到默认模式', () => {
    expect(findAgentMode('unknown').id).toBe('plan')
  })

  it('模式与技能白名单取交集，Plan 下技能无法放开写权限', () => {
    const planWithWriteSkill = resolveAllowedTools('plan', ['list_todos', 'create_todo'])
    expect([...planWithWriteSkill]).toEqual(['list_todos', MODE_SWITCH_TOOL])

    const buildWithSkill = resolveAllowedTools('build', ['list_todos', 'create_todo'])
    expect([...buildWithSkill]).toEqual(['list_todos', 'create_todo'])

    expect(resolveAllowedTools('build', [])).toBeNull()
    expect(resolveAllowedTools('plan', [])).toEqual(new Set([...READ_ONLY_TOOLS, MODE_SWITCH_TOOL]))
  })
})
