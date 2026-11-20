// 回收站按删除日期分组：供回收站列表使用，依赖已展平的树行与可见行集合。
// 子树跟随子树根的删除日期，父子不会被拆到不同日期；未知日期单独成组排在最后。

import { dayKeyOf, formatDayLabel } from './completedGroups'

export const groupTrashByDay = (rows, visibleIds, now = new Date()) => {
  const byId = new Map((rows || []).filter(item => !item._isRef).map(item => [item.id, item]))

  // 沿 parent_id 走到回收站里的最上层祖先，它就是这一组的日期来源
  const rootOf = (item) => {
    let current = item
    for (let guard = 0; guard < 100 && current?.parent_id != null; guard += 1) {
      const parent = byId.get(current.parent_id)
      if (!parent) break
      current = parent
    }
    return current || item
  }

  const groups = new Map()
  ;(rows || []).forEach((item) => {
    if (!visibleIds.has(item.id)) return
    const key = dayKeyOf(rootOf(item).deleted_at) || 'unknown'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key === 'unknown' ? '未知时间' : formatDayLabel(key, now),
        count: 0,
        items: []
      })
    }
    const group = groups.get(key)
    group.items.push(item)
    group.count += 1
  })

  return [...groups.values()].sort((a, b) => {
    if (a.key === 'unknown') return 1
    if (b.key === 'unknown') return -1
    return b.key.localeCompare(a.key)
  })
}
