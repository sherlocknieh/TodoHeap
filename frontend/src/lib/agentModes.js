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

// 切换模式本身在两种模式下都可用，否则 Plan 无法请求进入 Build
export const MODE_SWITCH_TOOL = 'switch_mode'

export const AGENT_MODES = [
  {
    id: 'plan',
    label: 'Plan',
    description: '只读分析，先给方案再动手',
    tools: [...READ_ONLY_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于 Plan 模式：只能读取数据，不能修改任何内容。
- 不要调用写入类工具；需要改动时，把方案写清楚交给用户确认。
- 方案要具体：涉及哪些任务、改成什么、先后顺序如何。
- 用户同意执行后，调用 switch_mode 请求切到 build；用户确认后即可继续动手。`
  },
  {
    id: 'build',
    label: 'Build',
    description: '可读写任务、日程与设置',
    tools: null,
    prompt: ''
  }
]

// 默认先规划：新会话从 Plan 开始，避免模型直接改数据
export const DEFAULT_AGENT_MODE = 'plan'

export const findAgentMode = (id) => (
  AGENT_MODES.find((mode) => mode.id === id)
  || AGENT_MODES.find((mode) => mode.id === DEFAULT_AGENT_MODE)
  || AGENT_MODES[0]
)

// 模式与技能白名单取交集：两者都限制时以更严格的一方为准
export const resolveAllowedTools = (modeId, skillTools) => {
  const mode = findAgentMode(modeId)
  const modeTools = mode.tools ? new Set(mode.tools) : null
  const skillSet = Array.isArray(skillTools) && skillTools.length ? new Set(skillTools) : null
  if (!modeTools && !skillSet) return null
  if (!modeTools) return skillSet
  if (!skillSet) return modeTools
  // 切换模式是逃生通道，技能白名单不应把它挡掉
  const merged = new Set([...modeTools].filter((name) => skillSet.has(name)))
  if (modeTools.has(MODE_SWITCH_TOOL)) merged.add(MODE_SWITCH_TOOL)
  return merged
}

// 工具名必须真实存在，避免模式配置写错后静默失效
export const isValidModeTools = () => AGENT_MODES.every((mode) => (
  !mode.tools || mode.tools.every((name) => AGENT_TOOL_NAMES.includes(name))
))
