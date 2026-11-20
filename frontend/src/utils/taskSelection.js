// 任务多选：供任务表待办区与已完成区的 Ctrl/⌘ 切换、Shift 连选使用。
// 选择只保存字符串键（任务 ID），不依赖任务对象，避免列表刷新后引用失效。

// 切换单个键：已选则移出，未选则加入
export const toggleSelection = (selection, key) => {
  const next = new Set(selection)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

// 连选：按当前可见顺序取锚点到目标之间的全部行，替换原选择；锚点不在可见行时退化为切换
export const selectRange = (selection, orderedKeys, anchorKey, targetKey) => {
  const start = orderedKeys.indexOf(anchorKey)
  const end = orderedKeys.indexOf(targetKey)
  if (start === -1 || end === -1) return toggleSelection(selection, targetKey)

  const [from, to] = start <= end ? [start, end] : [end, start]
  return new Set(orderedKeys.slice(from, to + 1))
}

// 清理已不存在的任务键；没有变化时返回原集合，避免多余刷新
export const pruneSelection = (selection, availableKeys) => {
  const available = availableKeys instanceof Set ? availableKeys : new Set(availableKeys)
  const kept = [...selection].filter(key => available.has(key))
  if (kept.length === selection.size) return selection
  return new Set(kept)
}
