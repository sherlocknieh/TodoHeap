// 主题偏好：auto 跟随系统，light/dark 覆盖系统；与界面状态同源，Agent 也能改
import { readUiState, UI_STATE_CHANGE_EVENT } from '@/utils/uiState'

export const THEME_KEY = 'theme'
export const THEME_MODES = ['auto', 'light', 'dark']
export const THEME_OPTIONS = [
  { value: 'auto', label: '自动', icon: 'sunMoon' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' }
]

export const normalizeThemeMode = (value) => (THEME_MODES.includes(value) ? value : 'auto')

// auto 只取决于系统偏好，其余模式直接使用所选值
export const resolveTheme = (mode, prefersDark) => {
  const normalized = normalizeThemeMode(mode)
  if (normalized !== 'auto') return normalized
  return prefersDark ? 'dark' : 'light'
}

const systemPrefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true

// 把解析后的主题写到根元素：dark: 变体据此生效，浏览器控件也跟着换色
const applyTheme = (mode) => {
  const resolved = resolveTheme(mode, systemPrefersDark())
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = resolved === 'dark' ? '#1b1b1b' : '#f1f3f3'
}

let started = false
let currentMode = 'auto'

const handleSystemChange = () => {
  if (currentMode === 'auto') applyTheme(currentMode)
}

// 设置页与 Agent 改的是同一个键，写入后在这里同步到界面
const handlePreferenceChange = (event) => {
  if (event.detail?.key !== THEME_KEY) return
  currentMode = normalizeThemeMode(event.detail.value)
  applyTheme(currentMode)
}

// 挂载前调用：首屏即为正确主题，并持续跟随系统与偏好变化
export const initTheme = () => {
  if (started || typeof window === 'undefined') return
  started = true
  currentMode = normalizeThemeMode(readUiState(THEME_KEY, 'auto'))
  applyTheme(currentMode)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', handleSystemChange)
  window.addEventListener(UI_STATE_CHANGE_EVENT, handlePreferenceChange)
}
