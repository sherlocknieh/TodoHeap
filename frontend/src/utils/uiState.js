import { getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'

// 界面状态本地持久化：刷新后回到离开时的布局与位置
const STORAGE_PREFIX = 'todoheap:ui:'

// 侧栏转为浮层的宽度阈值：更窄时才把侧栏抽屉盖在内容上，需与模板中的 md: 断点一致
export const SIDEBAR_FLOAT_BREAKPOINT = 768

// 读取本地状态；缺失或损坏时回退到默认值
export const readUiState = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// 写入本地状态；存储被禁用或写满时静默跳过，不影响界面
export const writeUiState = (key, value) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // 无法持久化时保持当前界面行为
  }
}

// 与本地存储同步的响应式状态：旧值不合法时用默认值，变化后自动保存
export const persistedRef = (key, fallback, { validate } = {}) => {
  const stored = readUiState(key, undefined)
  const usable = stored !== undefined && (!validate || validate(stored))
  const state = ref(usable ? stored : fallback)
  watch(state, (value) => writeUiState(key, value), { deep: true })
  return state
}

// 滚动位置记忆：内容异步渲染，容器长到足够高后再落位，避免被数据加载抹成顶部
export const useScrollMemory = (containerRef, keyRef) => {
  const restoring = ref(false)
  let saveTimer = null

  const currentKey = () => (typeof keyRef === 'function' ? keyRef() : keyRef.value)

  // 记录当前容器的位置，切换视图时按各自键保存，互不覆盖
  const save = () => {
    if (restoring.value || !containerRef.value) return
    const key = currentKey()
    const top = containerRef.value.scrollTop
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => writeUiState(`scroll:${key}`, top), 150)
  }

  const restore = () => {
    restoring.value = true
    const target = readUiState(`scroll:${currentKey()}`, 0)
    const finish = () => { restoring.value = false }
    if (!containerRef.value) {
      finish()
      return
    }
    // 新视图没有记录时回到顶部，避免沿用上一个视图的滚动位置
    if (!target) {
      containerRef.value.scrollTop = 0
      finish()
      return
    }
    let frames = 90
    const apply = () => {
      const el = containerRef.value
      if (!el) return finish()
      const max = el.scrollHeight - el.clientHeight
      if (max >= target) {
        el.scrollTop = target
        return finish()
      }
      // 内容仍未撑开时保留已保存的位置，等数据到达后再由调用方重试
      if (frames-- <= 0) return finish()
      requestAnimationFrame(apply)
    }
    requestAnimationFrame(apply)
  }

  // 切换视图或容器出现时恢复位置；先挂起保存，避免切换瞬间的归零覆盖旧记录
  watch(() => currentKey(), () => {
    restoring.value = true
    nextTick(restore)
  })
  watch(containerRef, (el) => {
    if (el) {
      restoring.value = true
      nextTick(restore)
    }
  })
  // 组件卸载时丢弃未落盘的保存任务
  if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(saveTimer))

  return { save, restore }
}
