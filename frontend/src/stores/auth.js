import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../supabase'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const session = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // 计算属性
  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)

  // 初始化认证状态
  const initialize = async () => {
    loading.value = true
    try {
      const { data } = await supabase.auth.getSession()
      session.value = data.session

      // 监听认证状态变化
      supabase.auth.onAuthStateChange((_, _session) => {
        session.value = _session
      })
    } catch (err) {
      error.value = err.message
      console.error('Auth initialization error:', err)
    } finally {
      loading.value = false
    }
  }

  // 登录
  const signIn = async (email, password) => {
    loading.value = true
    error.value = null
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (signInError) throw signInError
      session.value = data.session
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 注册
  const signUp = async (email, password) => {
    loading.value = true
    error.value = null
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      })
      if (signUpError) throw signUpError
      
      // 注册成功后可能需要邮箱验证
      if (data.user && !data.session) {
        return { 
          success: true, 
          needsVerification: true,
          message: '请检查您的邮箱以验证账号' 
        }
      }
      
      session.value = data.session
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 退出登录
  const signOut = async () => {
    loading.value = true
    error.value = null
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      session.value = null
      return { success: true }
    } catch (err) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  return {
    // 状态
    session,
    loading,
    error,
    // 计算属性
    user,
    isAuthenticated,
    // 方法
    initialize,
    signIn,
    signUp,
    signOut,
    clearError
  }
})