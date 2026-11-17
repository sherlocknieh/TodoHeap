import { computed } from 'vue'
import { persistedRef, readUiState } from './uiState'

// 任务折叠状态按任务 ID 共享给图、列表与回收站。
// 只记录用户显式切换过的任务；未记录的项由各视图按自己的展开档位决定默认值。
const STORAGE_KEY = 'task-collapsed'

const isCollapseMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// 旧版本把折叠状态分散在向导图与回收站两个键里，首次升级时并到同一份记录
const initialCollapseMap = () => {
  const stored = readUiState(STORAGE_KEY, undefined)
  if (isCollapseMap(stored)) return stored

  const migrated = {}
  const mindmapCollapsed = readUiState('mindmap-collapsed', [])
  if (Array.isArray(mindmapCollapsed)) {
    mindmapCollapsed.forEach((id) => { migrated[String(id)] = true })
  }

  const trashExpanded = readUiState('trash-expanded', {})
  if (isCollapseMap(trashExpanded)) {
    Object.entries(trashExpanded).forEach(([id, expanded]) => {
      if (expanded === false) migrated[String(id)] = true
    })
  }

  return migrated
}

const collapsedTasks = persistedRef(STORAGE_KEY, initialCollapseMap(), { validate: isCollapseMap })

// 折叠中的任务 ID 集合：图布局与键盘导航用集合判断，避免每次遍历对象
export const collapsedTaskSet = computed(() => new Set(
  Object.entries(collapsedTasks.value)
    .filter(([, collapsed]) => collapsed)
    .map(([id]) => id)
))

export const isTaskCollapsed = (id, fallback = false) => {
  const value = collapsedTasks.value[String(id)]
  return typeof value === 'boolean' ? value : fallback
}

export const setTaskCollapsed = (id, collapsed) => {
  const key = String(id)
  if (collapsedTasks.value[key] === collapsed) return
  collapsedTasks.value = { ...collapsedTasks.value, [key]: collapsed }
}

export const setTasksCollapsed = (ids, collapsed) => {
  const next = { ...collapsedTasks.value }
  let changed = false
  ids.forEach((id) => {
    const key = String(id)
    if (next[key] === collapsed) return
    next[key] = collapsed
    changed = true
  })
  if (changed) collapsedTasks.value = next
}

export const toggleTaskCollapsed = (id, fallback = false) => {
  const next = !isTaskCollapsed(id, fallback)
  setTaskCollapsed(id, next)
  return next
}

// 删除任务后清掉对应的折叠记录，保留当前仍存在的任务与根节点
export const pruneTaskCollapse = (ids, { keep = [] } = {}) => {
  const allowed = new Set([...ids].map(String))
  keep.forEach((id) => allowed.add(String(id)))

  const next = {}
  let changed = false
  Object.entries(collapsedTasks.value).forEach(([id, collapsed]) => {
    if (allowed.has(id)) next[id] = collapsed
    else changed = true
  })
  if (changed) collapsedTasks.value = next
}

// 从森林收集真实任务 ID 再清理；只有被保留节点时跳过，避免首屏数据未到时清空持久化状态
export const pruneTaskCollapseTree = (forest, { keep = [] } = {}) => {
  const ids = new Set()
  const walk = (node) => {
    if (node.isRef) return
    ids.add(String(node.id))
    ;(node.children || []).forEach(walk)
  }
  ;(forest || []).forEach(walk)

  const keepIds = new Set(keep.map(String))
  if (![...ids].some((id) => !keepIds.has(id))) return
  pruneTaskCollapse(ids, { keep })
}
