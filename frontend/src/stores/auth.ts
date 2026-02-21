import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'

// 登录状态管理
export const useAuthStore = defineStore('auth', () => {
  // ========== 内部控制（防并发 / 防重复 / 防泄漏） ==========

  // Supabase 认证状态监听器（用于清理）
  let authSubscription: { unsubscribe: () => void } | null = null

  // 初始化 Promise 缓存（并发去重）
  let initPromise: Promise<void> | null = null

  // ========== 初始化状态（是否完成尝试 / 是否失败 / 重试节流） ==========

  // 是否已成功初始化
  const initialized = ref(false)

  // 上次初始化是否失败
  const initFailed = ref(false)

  // 上次初始化尝试时间（用于失败后的重试冷却）
  const lastInitAttempt = ref(0)

  // 失败后的最小重试间隔（毫秒）
  const INIT_RETRY_COOLDOWN_MS = 5000

  // ========== 会话与操作状态 ==========

  // 当前会话（包含 user、access_token 等）
  const session = ref(null)

  // 认证相关操作中（初始化 / 登录 / 登出）
  const loading = ref(false)

  // 最近一次认证相关错误
  const error = ref(null)

  const setError = (err: unknown) => {
    error.value = err?.message ?? String(err)
  }

  const clearError = () => {
    error.value = null
  }

  const dispatchSignedOut = () => {
    window.dispatchEvent(new CustomEvent('auth:signedOut'))
  }

  const runAuthAction = async (action: { (): Promise<{ success: boolean }>; (): Promise<{ success: boolean; needsVerification: boolean; message: string } | { success: boolean; needsVerification?: undefined; message?: undefined }>; (): Promise<{ success: boolean }>; (): Promise<{ success: boolean }>; (): any }) => {
    loading.value = true
    clearError()

    try {
      return await action()
    } catch (err) {
      setError(err)
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  // ========== 计算属性 (Getters) ==========

  // 当前用户对象（从 session 中提取）
  const user = computed(() => session.value?.user ?? null)

  // 是否已登录（session 是否存在）
  const isAuthenticated = computed(() => !!session.value)

  // ========== 方法 (Actions) ==========

  /**
   * 初始化认证状态（拉取会话 + 绑定监听器）
   * 失败允许重试，并带冷却时间
   */
  const initialize = async (forceRetry = false) => {
    if (initialized.value && !forceRetry) return
    if (initPromise) return initPromise

    const now = Date.now()
    if (initFailed.value && !forceRetry && now - lastInitAttempt.value < INIT_RETRY_COOLDOWN_MS) {
      return
    }

    lastInitAttempt.value = now

    initPromise = (async () => {
      loading.value = true
      clearError()
      initFailed.value = false

      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        session.value = data.session ?? null

        if (!authSubscription) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, _session: null) => {
            session.value = _session

            if (event === 'SIGNED_OUT') {
              dispatchSignedOut()
            }
          })
          authSubscription = subscription
        }

        initialized.value = true
      } catch (err) {
        setError(err)
        initFailed.value = true
        initialized.value = false
      } finally {
        loading.value = false
        initPromise = null
      }
    })()
    return initPromise
  }

  const ensureInitialized = async () => {
    if (!initialized.value && !loading.value) {
      await initialize()
    }
  }

  /**
   * 用户登录
   * 
   * 执行流程：
   * 1. 确保认证已初始化（绑定监听器）
   * 2. 调用 Supabase 密码登录
   * 3. 更新本地 session（监听器也会自动更新）
   * 
   * @param {string} email - 用户邮箱
   * @param {string} password - 用户密码
   * @returns {Promise<{success: boolean, error?: string}>} 登录结果
   */
  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    await ensureInitialized()

    return runAuthAction(async () => {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) throw signInError

      session.value = data.session
      return { success: true }
    })
  }


  const signUp = async (email: string, password: string): Promise<{ success: boolean; needsVerification?: boolean; message?: string; error?: string }> => {
    await ensureInitialized()

    return runAuthAction(async () => {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      })

      if (signUpError) throw signUpError

      if (data.user && !data.session) {
        return {
          success: true,
          needsVerification: true,
          message: '请检查您的邮箱以验证账号'
        }
      }

      session.value = data.session
      return { success: true }
    })
  }


  const signInWithProvider = async (provider: string) => {
    await ensureInitialized()

    return runAuthAction(async () => {
      const isLocal = window.location.hostname === 'localhost';
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({ 
        provider: provider,
        options: {
          redirectTo: isLocal
            ? window.location.origin + '/#/auth/callback'
            : window.location.origin + '/TodoHeap/#/auth/callback'
        }
      })
      if (oauthError) throw oauthError

      if (data && data.url) {
        window.location.href = data.url
        console.log('重定向到 OAuth 提供商授权页面:', data.url)
        // 此处获得的 data.url ( https://nxzvisuvwtsnlrugqghx.supabase.co/auth/v1/authorize?provider=github&redirect_to=<redirectTo 的回调地址>
        // 用户会被重定向到 GitHub 授权页面 (https://github.com/login/oauth/authorize?...)
        // 授权成功后，GitHub 会重定向回 Supabase 的授权回调地址（例如：https://nxzvisuvwtsnlrugqghx.supabase.co/auth/v1/callback?provider=github&code=...）
        // 授权后再重定向回 redirectTo 的回调地址（例如：http://localhost:5173/#/auth/callback?provider=github&code=...）
      }

      return { success: true }
    })
  }

  // 登出
  const signOut = async (): Promise<{ success: boolean; error?: string }> => {
    return runAuthAction(async () => {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      session.value = null
      dispatchSignedOut()
      return { success: true }
    })
  }

  /**
   * 清理资源
   * 
   * 取消 Supabase 认证监听器订阅，防止内存泄漏
   * 通常在应用卸载或 Store 销毁时调用
   */
  const cleanup = () => {
    if (authSubscription) {
      authSubscription.unsubscribe()
      authSubscription = null
    }
  }

  // 导出
  return {
    // 状态
    session,
    loading,
    error,
    initialized,
    initFailed,
    user,
    isAuthenticated,
    // 方法
    initialize,
    signIn,
    signUp,
    signInWithProvider,
    signOut,
    clearError,
    cleanup
  }
})