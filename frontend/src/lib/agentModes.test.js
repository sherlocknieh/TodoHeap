import { describe, expect, it } from 'vitest'
import {
  AGENT_MODES,
  DEFAULT_AGENT_MODE,
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

  it('默认 Plan，Build 不限制工具，Plan 只给只读工具加切换入口', () => {
    expect(DEFAULT_AGENT_MODE).toBe('plan')
    expect(findAgentMode('build').tools).toBeNull()
    expect(findAgentMode('plan').tools).toEqual([...READ_ONLY_TOOLS, MODE_SWITCH_TOOL])
    expect(AGENT_MODES.map((mode) => mode.id)).toEqual([
      'plan', 'build', 'list', 'schedule', 'settings', 'list-schedule'
    ])
  })

  it('未知模式回退到默认模式', () => {
    expect(findAgentMode('unknown').id).toBe('plan')
  })

  it('单域模式只给本域工具，切换入口始终保留', () => {
    expect([...resolveAllowedTools('list')]).toEqual([...TODO_TOOLS, MODE_SWITCH_TOOL])
    expect([...resolveAllowedTools('schedule')]).toEqual([...SCHEDULE_TOOLS, MODE_SWITCH_TOOL])
    expect([...resolveAllowedTools('settings')]).toEqual([...SETTINGS_TOOLS, MODE_SWITCH_TOOL])
  })

  it('清单+日程模式合并两域工具，但不含设置写入', () => {
    const tools = resolveAllowedTools('list-schedule')
    expect(tools.has('create_todo')).toBe(true)
    expect(tools.has('create_schedule')).toBe(true)
    expect(tools.has('update_app_setting')).toBe(false)
    expect(tools.has(MODE_SWITCH_TOOL)).toBe(true)
  })

  it('Build 不限制工具', () => {
    expect(resolveAllowedTools('build')).toBeNull()
  })
})
