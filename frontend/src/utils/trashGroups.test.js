import { describe, expect, it } from 'vitest'
import { groupTrashByDay } from './trashGroups'

const now = new Date('2026-11-20T14:34:00')
const at = (value) => new Date(value).toISOString()

describe('groupTrashByDay', () => {
  it('子任务跟随子树根的删除日期归组', () => {
    const rows = [
      { id: 1, parent_id: null, deleted_at: at('2026-11-20T09:00:00') },
      { id: 2, parent_id: 1, deleted_at: at('2026-11-18T09:00:00') },
      { id: 3, parent_id: null, deleted_at: at('2026-11-19T09:00:00') }
    ]
    const groups = groupTrashByDay(rows, new Set([1, 2, 3]), now)

    expect(groups.map(group => group.key)).toEqual(['2026-11-20', '2026-11-19'])
    expect(groups[0]).toMatchObject({ label: '今天', count: 2 })
    expect(groups[0].items.map(item => item.id)).toEqual([1, 2])
  })

  it('只包含可见行，未知日期排在最后', () => {
    const rows = [
      { id: 1, parent_id: null, deleted_at: at('2026-11-19T09:00:00') },
      { id: 2, parent_id: null, deleted_at: at('2026-11-20T09:00:00') },
      { id: 3, parent_id: null, deleted_at: null }
    ]
    const groups = groupTrashByDay(rows, new Set([1, 3]), now)

    expect(groups.map(group => group.label)).toEqual(['昨天', '未知时间'])
  })
})
