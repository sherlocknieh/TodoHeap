import { supabase } from '@/lib/supabase'

export const DEFAULT_USER_SETTINGS = {
  autoApplyAITasks: false
}

export const normalizeUserSettings = (settings) => {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    ...DEFAULT_USER_SETTINGS,
    ...source,
    autoApplyAITasks: Boolean(source.autoApplyAITasks)
  }
}

export const fetchUserSettings = async (userId) => {
  if (!userId) {
    return { success: true, data: { ...DEFAULT_USER_SETTINGS } }
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return { success: false, error }
  }

  return {
    success: true,
    data: normalizeUserSettings(data?.settings)
  }
}

export const saveUserSettings = async (userId, settings) => {
  if (!userId) {
    return { success: false, error: new Error('用户未登录') }
  }

  const normalized = normalizeUserSettings(settings)

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        settings: normalized
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    return { success: false, error }
  }

  return { success: true, data: normalized }
}
