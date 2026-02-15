import { useAuthStore } from '../stores/auth'

// 标记守卫是否已设置，防止重复注册
let guardsSetup = false

/**
 * 设置路由守卫
 * 
 * 功能说明：
 * - 首次导航时初始化认证状态
 * - 保护需要认证的路由，未登录重定向到登录页
 * - 已登录用户访问登录页时重定向到应用页
 * - 自动设置页面标题
 * - 监听登出事件，自动跳转受保护页面
 * 
 * 设计要点：
 * - 使用 Promise 并发优化：多次导航只等待一次初始化
 * - 保存重定向参数：登录成功后可跳回原页面
 * - 懒初始化：不阻塞应用启动
 * - 防重复设置：通过 guardsSetup 标志防止多次调用
 */
export function setupGuards(router) {
  // 防止重复设置守卫
  if (guardsSetup) {
    console.warn('[guards] setupGuards 已经被调用，忽略重复调用')
    return
  }

  // 监听登出事件（跨标签或 token 失效），在受保护页面时跳转到登录页
  if (typeof window !== 'undefined') {
    window.addEventListener('auth:signedOut', () => {
      const current = router.currentRoute.value
      if (current?.meta?.requiresAuth) {
        router.replace({ name: 'Login', query: { redirect: current.fullPath } })
      }
    })
  }

  // 路由导航前：检查认证状态
  router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore()

    // 未初始化时进行初始化
    if (!authStore.initialized) {
      try {
        await authStore.initialize()
      } catch (error) {
        console.error('认证初始化失败:', error)
        // 即使初始化失败，也需要继续导航，
        // 否则路由会卡住，导致白屏。
        // 后续的 isAuthenticated 检查会处理重定向。
      }
    }
    
    const isAuthenticated = authStore.isAuthenticated
    
    // 需要认证但未登录，重定向到登录页（保存目标路径）
    if (to.meta.requiresAuth && !isAuthenticated) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
    
    // 已登录用户访问登录页，重定向到应用页
    if (to.name === 'Login' && isAuthenticated) {
      next({ name: 'App' })
      return
    }
    
    // 其他情况，正常访问
    next()
  })
  
  // 路由导航后：设置页面标题
  router.afterEach((to) => {
    const title = to.meta.title || 'TodoHeap'
    document.title = title
  })

  // 标记守卫已设置
  guardsSetup = true
}
