import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  insertSingle: vi.fn(),
  updateSingle: vi.fn()
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: mocks.insertSingle }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: mocks.updateSingle }) }) }) })
    })
  }
}))

vi.mock('./auth', () => ({ useAuthStore: () => ({ user: { id: 'user-1' } }) }))

const { useScheduleStore } = await import('./schedules')

const newEvent = {
  title: '新日程',
  start_at: '2026-11-20T10:00:00.000Z',
  end_at: '2026-11-20T11:00:00.000Z'
}

describe('日程乐观新建', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.insertSingle.mockReset()
    mocks.updateSingle.mockReset()
  })

  it('立即返回临时行，写库成功后替换成真实行', async () => {
    let resolveInsert
    mocks.insertSingle.mockImplementation(() => new Promise((resolve) => { resolveInsert = resolve }))

    const store = useScheduleStore()
    const result = store.createSchedule(newEvent)

    expect(result.success).toBe(true)
    const tempId = result.data.id
    expect(store.schedules.map((item) => item.id)).toEqual([tempId])
    expect(store.syncStatus).toBe('saving')

    resolveInsert({ data: { ...result.data, id: 7 }, error: null })
    const outcome = await result.settled

    expect(outcome.success).toBe(true)
    expect(store.schedules.map((item) => item.id)).toEqual([7])
    expect(store.findSchedule(tempId)?.id).toBe(7)
    expect(store.isSameSchedule(tempId, 7)).toBe(true)
    expect(store.syncStatus).toBe('idle')
  })

  it('临时 id 的修改会等新建落库后再打到真实行', async () => {
    let resolveInsert
    mocks.insertSingle.mockImplementation(() => new Promise((resolve) => { resolveInsert = resolve }))
    mocks.updateSingle.mockResolvedValue({
      data: { ...newEvent, id: 9, title: '改过' },
      error: null
    })

    const store = useScheduleStore()
    const result = store.createSchedule(newEvent)
    const pendingUpdate = store.updateSchedule(result.data.id, { title: '改过' })

    expect(mocks.updateSingle).not.toHaveBeenCalled()

    resolveInsert({ data: { ...result.data, id: 9 }, error: null })
    const updated = await pendingUpdate

    expect(updated.success).toBe(true)
    expect(mocks.updateSingle).toHaveBeenCalled()
    expect(store.schedules.map((item) => item.id)).toEqual([9])
    expect(store.schedules[0].title).toBe('改过')
  })

  it('写库失败时回滚临时行并留下失败原因', async () => {
    mocks.insertSingle.mockResolvedValue({ data: null, error: new Error('网络错误') })

    const store = useScheduleStore()
    const result = store.createSchedule(newEvent)
    const outcome = await result.settled

    expect(outcome.success).toBe(false)
    expect(outcome.error).toBe('网络错误')
    expect(store.schedules).toHaveLength(0)
    expect(store.syncStatus).toBe('error')
  })
})
