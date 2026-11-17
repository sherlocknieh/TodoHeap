import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

// 日程字段集中在 store 里，拉取/写入/订阅共用同一份列表
const SCHEDULE_COLUMNS = [
  'id', 'title', 'notes', 'location', 'url', 'attendees', 'all_day',
  'status', 'color', 'reminder_minutes', 'external_id',
  'start_at', 'end_at', 'todo_id', 'updated_at'
].join(', ')

const normalizeText = (value) => {
  const text = String(value ?? '').trim()
  return text || null
}

const normalizeAttendees = (value) => {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，;；]/)
  return [...new Set(list.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

const normalizeReminders = (value) => {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，\s]+/)
  return [...new Set(list
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 0))]
    .sort((a, b) => a - b)
}

// 外部导入的事件按字段归一化，界面与 Agent 创建的日程走同一套默认值
const toRow = (event, userId) => ({
  user_id: userId,
  title: String(event.title ?? '').trim(),
  notes: normalizeText(event.notes),
  location: normalizeText(event.location),
  url: normalizeText(event.url),
  attendees: normalizeAttendees(event.attendees),
  all_day: Boolean(event.all_day),
  status: ['confirmed', 'tentative', 'cancelled'].includes(event.status) ? event.status : 'confirmed',
  color: /^#[0-9a-fA-F]{6}$/.test(event.color ?? '') ? event.color : null,
  reminder_minutes: normalizeReminders(event.reminder_minutes),
  external_id: normalizeText(event.external_id),
  start_at: event.start_at,
  end_at: event.end_at,
  todo_id: event.todo_id ?? null
})

export const useScheduleStore = defineStore('schedules', () => {
  const schedules = ref([])
  const loading = ref(false)
  const error = ref(null)
  const isFetched = ref(false)

  const requireUserId = () => {
    const authStore = useAuthStore()
    if (!authStore.user?.id) {
      return { ok: false, error: '请先登录' }
    }
    return { ok: true, userId: authStore.user.id }
  }

  // 侧栏与日程页会同时进入，同一时刻只发一次请求，两处共用结果
  let inflight = null

  // 拉取全部日程；订阅端更新后可由调用方强制刷新
  const fetchSchedules = async ({ force = false } = {}) => {
    if (isFetched.value && !force) return { success: true, data: schedules.value }
    if (inflight) return inflight

    inflight = (async () => {
      const auth = requireUserId()
      if (!auth.ok) return { success: false, error: auth.error }

      loading.value = true
      error.value = null
      try {
        const { data, error: fetchError } = await supabase
          .from('schedules')
          .select(SCHEDULE_COLUMNS)
          .eq('user_id', auth.userId)
          .order('start_at', { ascending: true })

        if (fetchError) throw fetchError
        schedules.value = data || []
        isFetched.value = true
        return { success: true, data: schedules.value }
      } catch (err) {
        error.value = err instanceof Error ? err.message : '读取日程失败'
        return { success: false, error: error.value }
      } finally {
        loading.value = false
      }
    })()

    try {
      return await inflight
    } finally {
      inflight = null
    }
  }

  // 批量写入导入事件；外部来源键相同的事件直接跳过，避免同一份 ICS 重复导入
  const createSchedules = async (events) => {
    if (!events.length) return { success: true, data: [] }

    const auth = requireUserId()
    if (!auth.ok) return { success: false, error: auth.error }

    try {
      const rows = events.map((event) => toRow(event, auth.userId))
      const { data, error: insertError } = await supabase
        .from('schedules')
        .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
        .select(SCHEDULE_COLUMNS)

      if (insertError) throw insertError
      schedules.value = [...schedules.value, ...(data || [])]
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
      return { success: true, data: data || [] }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '写入日程失败' }
    }
  }

  // 修改单条日程：先落到本地，请求失败再回滚
  const updateSchedule = async (id, updates) => {
    const auth = requireUserId()
    if (!auth.ok) return { success: false, error: auth.error }

    const index = schedules.value.findIndex((item) => item.id === id)
    if (index === -1) return { success: false, error: '日程不存在' }

    const snapshot = { ...schedules.value[index] }
    schedules.value[index] = { ...snapshot, ...updates }

    try {
      const { data, error: updateError } = await supabase
        .from('schedules')
        .update(updates)
        .eq('id', id)
        .eq('user_id', auth.userId)
        .select(SCHEDULE_COLUMNS)
        .single()

      if (updateError) throw updateError
      schedules.value[index] = data
      schedules.value = [...schedules.value].sort((a, b) => a.start_at.localeCompare(b.start_at))
      return { success: true, data }
    } catch (err) {
      schedules.value[index] = snapshot
      return { success: false, error: err instanceof Error ? err.message : '更新日程失败' }
    }
  }

  // 删除单条日程，供导入错误或过期事件清理
  const deleteSchedule = async (id) => {
    const auth = requireUserId()
    if (!auth.ok) return { success: false, error: auth.error }

    const snapshot = schedules.value
    schedules.value = schedules.value.filter((item) => item.id !== id)
    try {
      const { error: deleteError } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)
        .eq('user_id', auth.userId)

      if (deleteError) throw deleteError
      return { success: true }
    } catch (err) {
      schedules.value = snapshot
      return { success: false, error: err instanceof Error ? err.message : '删除日程失败' }
    }
  }

  return {
    schedules,
    loading,
    error,
    isFetched,
    fetchSchedules,
    createSchedules,
    updateSchedule,
    deleteSchedule
  }
})
