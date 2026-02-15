import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../libs/supabase'

/**
 * 认证状态管理 Store
 * 
 * 功能说明：
 * - 管理用户登录状态、会话信息
 * - 提供登录、注册、登出等认证方法
 * - 监听 Supabase 认证状态变化，实现跨标签页同步
 * - 登出时触发全局清理事件，通知其他 Store 清理数据
 * 
 * 设计要点：
 * - 懒初始化：首次导航时才初始化，不阻塞应用启动
 * - 防并发：通过 loading 标志防止并发初始化
 * - 防重复：通过 initialized 标志防止重复初始化
 * - 监听器去重：确保 onAuthStateChange 只绑定一次
 */
export const useAuthStore = defineStore('auth', () => {
  // ========== 内部控制（防并发 / 防重复 / 防泄漏） ==========

  // Supabase 认证状态监听器（用于清理）
  let authSubscription = null

  // 初始化 Promise 缓存（并发去重）
  let initPromise = null

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

  const setError = (err) => {
    error.value = err?.message ?? String(err)
  }

  const clearError = () => {
    error.value = null
  }

  const dispatchSignedOut = () => {
    window.dispatchEvent(new CustomEvent('auth:signedOut'))
  }

  const runAuthAction = async (action) => {
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
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
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
  const signIn = async (email, password) => {
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

  /**
   * 用户注册
   * 
   * 执行流程：
   * 1. 确保认证已初始化（绑定监听器）
   * 2. 调用 Supabase 注册
   * 3. 如果需要邮箱验证，返回提示信息
   * 4. 否则自动登录
   * 
   * @param {string} email - 用户邮箱
   * @param {string} password - 用户密码
   * @returns {Promise<{success: boolean, needsVerification?: boolean, message?: string, error?: string}>} 注册结果
   */
  const signUp = async (email, password) => {
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

  /**
   * 用户登出
   * 
   * 执行流程：
   * 1. 调用 Supabase 登出
   * 2. 清空本地 session（监听器也会自动更新）
   * 3. 触发全局 auth:signedOut 事件，通知其他 Store 清理数据
   * 
   * @returns {Promise<{success: boolean, error?: string}>} 登出结果
   */
  const signOut = async () => {
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

  // ========== 导出 ==========

  return {
    // 状态
    session,
    loading,
    error,
    initialized,
    initFailed,
    // 计算属性
    user,
    isAuthenticated,
    // 方法
    initialize,
    signIn,
    signUp,
    signOut,
    clearError,
    cleanup
  }
})