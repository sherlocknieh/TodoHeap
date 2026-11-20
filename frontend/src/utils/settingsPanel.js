import { ref } from 'vue'

// 设置面板的标签：整页与浮窗共用同一份定义，地址栏的 tab 参数据此校验
export const SETTINGS_TABS = [
  { id: 'account', label: '账户安全', icon: 'lock' },
  { id: 'provider', label: '模型接入', icon: 'key' },
  { id: 'calendar', label: '日历', icon: 'calendar' },
  { id: 'import', label: '导入数据', icon: 'upload' }
]

export const isValidSettingsTab = (id) => SETTINGS_TABS.some((tab) => tab.id === id)

// 设置浮窗开合：应用页承载浮窗，设置页也能把设置收回浮窗
export const settingsPanelOpen = ref(false)
