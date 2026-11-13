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

// 清单域：任务树、完成状态与回收站
export const TODO_TOOLS = [
  'list_todos',
  'get_todo',
  'create_todo',
  'update_todo',
  'move_todo',
  'complete_todo',
  'link_todo',
  'unlink_todo',
  'delete_todo',
  'delete_completed_todos',
  'restore_todo',
  'permanent_delete_todo',
  'empty_trash',
  'list_trash'
]

// 日程域：日程事件的增删改查
export const SCHEDULE_TOOLS = [
  'list_schedules',
  'create_schedule',
  'update_schedule',
  'delete_schedule'
]

// 设置域：界面偏好、模型参数、技能与日历订阅
export const SETTINGS_TOOLS = [
  'list_app_settings',
  'update_app_setting',
  'create_skill',
  'update_skill',
  'delete_skill',
  'rotate_calendar_feed',
  'disable_calendar_feed'
]

// 切换模式本身在所有模式下都可用，否则受限模式无法请求放开权限
export const MODE_SWITCH_TOOL = 'switch_mode'

// 提问面板在所有模式下都可用：受限模式也要能向用户确认方案
export const ASK_USER_TOOL = 'ask_user'

export const AGENT_MODES = [
  {
    id: 'plan',
    label: 'Plan',
    description: '只读分析，先给方案再动手',
    tools: [...READ_ONLY_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于 Plan 模式：只能读取数据，不能修改任何内容。
- 不要调用写入类工具；需要改动时，把方案写清楚交给用户确认。
- 方案要具体：涉及哪些任务、改成什么、先后顺序如何。
- 方案写完后，在同一条回复里立即调用 switch_mode 请求切到 build，不要只说“你确认后我再切”然后停下等用户再发消息；用户点确认后本轮继续执行。
- 方案里有需要用户拍板的点（时间、对象、范围）时，用 ask_user 给出可直接执行的选项，不要只在正文里提问。`
  },
  {
    id: 'build',
    label: 'Build',
    description: '可读写任务、日程与设置',
    tools: null,
    prompt: ''
  },
  {
    id: 'list',
    label: '清单',
    description: '只管理任务清单',
    tools: [...TODO_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于清单模式：只处理任务清单，不碰日程与应用设置。
- 可以创建、修改、移动、完成、删除任务，也可以操作回收站。
- 用户提到日程或设置时，说明当前模式不覆盖，并在同一条回复里调用 switch_mode 请求切到对应模式，不要只让用户自己切换。`
  },
  {
    id: 'schedule',
    label: '日程',
    description: '只管理日程事件',
    tools: [...SCHEDULE_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于日程模式：只处理日程事件，不碰任务清单与应用设置。
- 可以创建、修改、删除日程；需要任务信息时只能读取，不能改动任务。
- 用户提到任务或设置时，说明当前模式不覆盖，并在同一条回复里调用 switch_mode 请求切到对应模式，不要只让用户自己切换。`
  },
  {
    id: 'settings',
    label: '设置',
    description: '只管理应用设置与技能',
    tools: [...SETTINGS_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于设置模式：只处理应用设置与技能，不碰任务清单与日程。
- 改设置前先调用 list_app_settings 确认键名与当前值。
- 用户提到任务或日程时，说明当前模式不覆盖，并建议切换到对应模式。`
  },
  {
    id: 'list-schedule',
    label: '清单+日程',
    description: '任务与日程双向管理',
    tools: [...TODO_TOOLS, ...SCHEDULE_TOOLS, MODE_SWITCH_TOOL],
    prompt: `当前处于清单+日程模式：任务与日程可以互相联动，但不改应用设置。
- 可以把任务安排成日程，也可以从日程反推任务。
- 用户提到设置时，说明当前模式不覆盖，并在同一条回复里调用 switch_mode 请求切到 settings，不要只让用户自己切换。`
  }
]

// 默认先规划：新会话从 Plan 开始，避免模型直接改数据
export const DEFAULT_AGENT_MODE = 'plan'

export const findAgentMode = (id) => (
  AGENT_MODES.find((mode) => mode.id === id)
  || AGENT_MODES.find((mode) => mode.id === DEFAULT_AGENT_MODE)
  || AGENT_MODES[0]
)

// 只读模式：内置工具都被限制在读取范围内，外部 MCP 工具也只保留声明只读的那些
export const READ_ONLY_MODE_IDS = ['plan']

export const isReadOnlyMode = (modeId) => READ_ONLY_MODE_IDS.includes(findAgentMode(modeId).id)

// 模式决定本轮可用工具：null 表示不限制；提问与切换入口始终保留
export const resolveAllowedTools = (modeId) => {
  const mode = findAgentMode(modeId)
  return mode.tools ? new Set([...mode.tools, ASK_USER_TOOL]) : null
}

// 工具名必须真实存在，避免模式配置写错后静默失效
export const isValidModeTools = () => AGENT_MODES.every((mode) => (
  !mode.tools || mode.tools.every((name) => AGENT_TOOL_NAMES.includes(name))
))
