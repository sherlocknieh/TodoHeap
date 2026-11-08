import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

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

  // 拉取全部日程；订阅端更新后可由调用方强制刷新
  const fetchSchedules = async ({ force = false } = {}) => {
    if (isFetched.value && !force) return { success: true, data: schedules.value }

    const auth = requireUserId()
    if (!auth.ok) return { success: false, error: auth.error }

    loading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('schedules')
        .select('id, title, notes, start_at, end_at, updated_at')
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
  }

  // 批量写入导入事件；单次请求保证要么全部入库，要么全部失败
  const createSchedules = async (events) => {
    if (!events.length) return { success: true, data: [] }

    const auth = requireUserId()
    if (!auth.ok) return { success: false, error: auth.error }

    try {
      const rows = events.map((event) => ({
        user_id: auth.userId,
        title: event.title,
        notes: event.notes ?? null,
        start_at: event.start_at,
        end_at: event.end_at
      }))
      const { data, error: insertError } = await supabase
        .from('schedules')
        .insert(rows)
        .select('id, title, notes, start_at, end_at, updated_at')

      if (insertError) throw insertError
      schedules.value = [...schedules.value, ...(data || [])]
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
      return { success: true, data: data || [] }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '写入日程失败' }
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
    deleteSchedule
  }
})
