// 应用设置注册表：界面偏好与模型参数的唯一事实来源，Agent 与设置页共用
import { readUiState, writeUiState } from '@/utils/uiState'

// 界面偏好：键名与各组件 persistedRef 使用的键一致，写入后组件即时生效
export const UI_PREFERENCE_SETTINGS = [
  {
    key: 'mindmap-direction',
    label: '任务图布局方向',
    group: '界面',
    type: 'enum',
    options: [
      { value: 'down', label: '从上到下' },
      { value: 'right', label: '从左到右' },
      { value: 'up', label: '从下到上' },
      { value: 'left', label: '从右到左' }
    ],
    default: 'right'
  },
  { key: 'sidebar-open', label: '显示左侧栏', group: '界面', type: 'boolean', default: true },
  { key: 'rail-open', label: '显示活动栏', group: '界面', type: 'boolean', default: true },
  { key: 'detail-open', label: '显示详情面板', group: '界面', type: 'boolean', default: false },
  { key: 'list-show-completed', label: '列表显示已完成任务', group: '界面', type: 'boolean', default: true }
]

// 模型参数：只开放行为参数，密钥与地址属于凭据，不交给 Agent
export const MODEL_PARAMETER_SETTINGS = [
  {
    key: 'temperature',
    label: 'temperature（随机性）',
    group: '模型',
    type: 'number',
    min: 0,
    max: 2,
    default: 0.2
  }
]

export const APP_SETTINGS = [...UI_PREFERENCE_SETTINGS, ...MODEL_PARAMETER_SETTINGS]

export const findSetting = (key) => APP_SETTINGS.find((setting) => setting.key === key) || null

// 校验并归一化单个值；不合法时抛出可读错误，让模型自行修正
export const normalizeSettingValue = (setting, value) => {
  if (!setting) throw new Error('未知设置项')
  if (setting.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${setting.label} 需要 true 或 false`)
    return value
  }
  if (setting.type === 'enum') {
    const allowed = setting.options.map((option) => option.value)
    if (!allowed.includes(value)) {
      throw new Error(`${setting.label} 只能是：${allowed.join('、')}`)
    }
    return value
  }
  if (setting.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) throw new Error(`${setting.label} 需要数字`)
    if (number < setting.min || number > setting.max) {
      throw new Error(`${setting.label} 需在 ${setting.min} 到 ${setting.max} 之间`)
    }
    return number
  }
  throw new Error('不支持的设置类型')
}

// 读取界面偏好当前值，缺失时回退到默认值
export const readUiPreference = (setting) => {
  const stored = readUiState(setting.key, undefined)
  if (stored === undefined) return setting.default
  try {
    return normalizeSettingValue(setting, stored)
  } catch {
    return setting.default
  }
}

export const writeUiPreference = (setting, value) => {
  writeUiState(setting.key, normalizeSettingValue(setting, value))
}

// 供 Agent 展示的当前设置快照：界面偏好取本地值，模型参数由调用方补充
export const describeUiPreferences = () => UI_PREFERENCE_SETTINGS.map((setting) => ({
  key: setting.key,
  label: setting.label,
  group: setting.group,
  type: setting.type,
  value: readUiPreference(setting),
  ...(setting.options ? { options: setting.options.map((option) => option.value) } : {}),
  ...(setting.type === 'number' ? { min: setting.min, max: setting.max } : {})
}))
