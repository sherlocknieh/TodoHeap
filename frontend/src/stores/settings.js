import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '../api/supabase'

const STORAGE_KEY = 'todoheap_settings'

export const useSettingsStore = defineStore('settings', () => {
  // 设置项
  const autoApplyAITasks = ref(false) // 是否立即应用 AI 生成的子任务，默认为否
  
  // 同步状态
  const isSyncing = ref(false)
  const lastSyncError = ref(null)
  
  // 内部标记，防止循环同步
  let skipWatch = false
  
  // 获取当前设置对象
  const getSettingsObject = () => ({
    autoApplyAITasks: autoApplyAITasks.value
  })
  
  // 应用设置对象到响应式变量
  const applySettings = (settings) => {
    skipWatch = true
    if (typeof settings.autoApplyAITasks === 'boolean') {
      autoApplyAITasks.value = settings.autoApplyAITasks
    }
    // 下一个 tick 后恢复 watch
    setTimeout(() => { skipWatch = false }, 0)
  }
  
  // 从 localStorage 加载设置（本地缓存）
  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const settings = JSON.parse(saved)
        applySettings(settings)
        return true
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e)
    }
    return false
  }
  
  // 保存设置到 localStorage
  const saveToLocalStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettingsObject()))
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e)
    }
  }
  
  // 从 Supabase 加载设置
  const loadFromSupabase = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 未登录，仅使用本地存储
        return false
      }
      
      isSyncing.value = true
      lastSyncError.value = null
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', user.id)
        .single()
      
      if (error) {
        // PGRST116 表示没有找到记录，这是正常情况（新用户）
        if (error.code === 'PGRST116') {
          console.log('No settings found in database, using defaults')
          return false
        }
        throw error
      }
      
      if (data?.settings) {
        applySettings(data.settings)
        saveToLocalStorage() // 同步到本地缓存
        return true
      }
      
      return false
    } catch (e) {
      console.warn('Failed to load settings from Supabase:', e)
      lastSyncError.value = e.message
      return false
    } finally {
      isSyncing.value = false
    }
  }
  
  // 保存设置到 Supabase
  const saveToSupabase = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 未登录，仅保存到本地
        return false
      }
      
      isSyncing.value = true
      lastSyncError.value = null
      
      const settings = getSettingsObject()
      
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          settings: settings,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })
      
      if (error) throw error
      
      return true
    } catch (e) {
      console.warn('Failed to save settings to Supabase:', e)
      lastSyncError.value = e.message
      return false
    } finally {
      isSyncing.value = false
    }
  }
  
  // 加载设置（优先从 Supabase，回退到 localStorage）
  const loadSettings = async () => {
    // 先从本地加载，确保快速响应
    loadFromLocalStorage()
    
    // 然后尝试从 Supabase 同步
    await loadFromSupabase()
  }
  
  // 保存设置（同时保存到 localStorage 和 Supabase）
  const saveSettings = async () => {
    if (skipWatch) return
    
    // 立即保存到本地
    saveToLocalStorage()
    
    // 异步保存到 Supabase
    await saveToSupabase()
  }
  
  // 监听变化自动保存
  watch(autoApplyAITasks, () => {
    if (!skipWatch) {
      saveSettings()
    }
  })
  
  // 监听认证状态变化，登录后重新加载设置
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // 登录后从服务器加载设置
      loadFromSupabase()
    } else if (event === 'SIGNED_OUT') {
      // 登出后清除同步状态，但保留本地设置
      lastSyncError.value = null
    }
  })
  
  // 初始化时加载设置
  loadSettings()
  
  return {
    // 设置项
    autoApplyAITasks,
    
    // 同步状态
    isSyncing,
    lastSyncError,
    
    // 方法
    loadSettings,
    saveSettings,
    loadFromSupabase,
    saveToSupabase
  }
})