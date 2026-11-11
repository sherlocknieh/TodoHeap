// 工作模式：不同模式发送不同的工具集与提示词，减少无关工具占用的 token
import { AGENT_TOOL_NAMES } from './agentTools'

// 只读工具：Plan 模式只允许查看，不产生任何写入
export const READ_ONLY_TOOLS = [
  'list_todos',
  'get_todo',
  'list_trash',
  'list_schedules',
  'list_app_settings'
]

export const AGENT_MODES = [
  {
    id: 'build',
    label: 'Build',
    description: '可读写任务、日程与设置',
    tools: null,
    prompt: ''
  },
  {
    id: 'plan',
    label: 'Plan',
    description: '只读分析，先给方案再动手',
    tools: READ_ONLY_TOOLS,
    prompt: `当前处于 Plan 模式：只能读取数据，不能修改任何内容。
- 不要调用写入类工具；需要改动时，把方案写清楚交给用户确认。
- 方案要具体：涉及哪些任务、改成什么、先后顺序如何。
- 用户确认后提示他切到 Build 模式执行。`
  }
]

export const DEFAULT_AGENT_MODE = 'build'

export const findAgentMode = (id) => AGENT_MODES.find((mode) => mode.id === id) || AGENT_MODES[0]

// 模式与技能白名单取交集：两者都限制时以更严格的一方为准
export const resolveAllowedTools = (modeId, skillTools) => {
  const mode = findAgentMode(modeId)
  const modeTools = mode.tools ? new Set(mode.tools) : null
  const skillSet = Array.isArray(skillTools) && skillTools.length ? new Set(skillTools) : null
  if (!modeTools && !skillSet) return null
  if (!modeTools) return skillSet
  if (!skillSet) return modeTools
  return new Set([...modeTools].filter((name) => skillSet.has(name)))
}

// 工具名必须真实存在，避免模式配置写错后静默失效
export const isValidModeTools = () => AGENT_MODES.every((mode) => (
  !mode.tools || mode.tools.every((name) => AGENT_TOOL_NAMES.includes(name))
))
