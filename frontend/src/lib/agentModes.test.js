import { describe, expect, it } from 'vitest'
import {
  AGENT_MODES,
  DEFAULT_AGENT_MODE,
  ASK_USER_TOOL,
  MODE_SWITCH_TOOL,
  READ_ONLY_TOOLS,
  SCHEDULE_TOOLS,
  SETTINGS_TOOLS,
  TODO_TOOLS,
  findAgentMode,
  isValidModeTools,
  resolveAllowedTools
} from './agentModes'

describe('agentModes', () => {
  it('模式配置里的工具名都真实存在', () => {
    expect(isValidModeTools()).toBe(true)
  })

  it('默认只读模式，全能模式不限制工具，只读模式只给只读工具加切换入口', () => {
    expect(DEFAULT_AGENT_MODE).toBe('plan')
    expect(findAgentMode('build').tools).toBeNull()
    expect(findAgentMode('plan').tools).toEqual([...READ_ONLY_TOOLS, MODE_SWITCH_TOOL])
    expect(AGENT_MODES.map((mode) => mode.id)).toEqual(['plan', 'build', 'list', 'schedule', 'settings'])
  })

  it('模式名称按读写范围命名', () => {
    expect(AGENT_MODES.map((mode) => mode.label)).toEqual(['只读模式', '全能模式', '清单读写', '日程读写', '设置读写'])
  })

  it('已移除的模式按原权限落到全能模式', () => {
    expect(findAgentMode('list-schedule').id).toBe('build')
  })

  it('未知模式回退到默认模式', () => {
    expect(findAgentMode('unknown').id).toBe('plan')
  })

  it('单域模式只给本域工具，切换与提问入口始终保留', () => {
    expect([...resolveAllowedTools('list')]).toEqual([...TODO_TOOLS, MODE_SWITCH_TOOL, ASK_USER_TOOL])
    expect([...resolveAllowedTools('schedule')]).toEqual([...SCHEDULE_TOOLS, MODE_SWITCH_TOOL, ASK_USER_TOOL])
    expect([...resolveAllowedTools('settings')]).toEqual([...SETTINGS_TOOLS, MODE_SWITCH_TOOL, ASK_USER_TOOL])
  })

  it('全能模式不限制工具', () => {
    expect(resolveAllowedTools('build')).toBeNull()
  })
})

describe('只读模式', () => {
  it('只读模式不可写，其余模式可写', async () => {
    const { isReadOnlyMode } = await import('./agentModes')
    expect(isReadOnlyMode('plan')).toBe(true)
    expect(isReadOnlyMode('build')).toBe(false)
    expect(isReadOnlyMode('list')).toBe(false)
    expect(isReadOnlyMode('unknown')).toBe(true)
  })
})
