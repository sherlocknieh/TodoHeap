/**
 * @module handleAuthCallback
 * 
 * [问题来由] 
 * 
 * Supabase 的认证流程中，用户注册后会通过回调 URL 将 access_token 和 refresh_token 传回应用。
 * 正常情况下回调链接类似: /#access_token=... , 能被 Supabase SDK 自动处理
 * 但是本应用使用 Vue Router 的 Hash 路由模式，回调 URL 会变成 /#/access_token...
 * 导致 SDK 无法正确解析，同时 Vue Router 也不能匹配到正确的路由，最终显示 404 页面。
 *
 * [模块功能]
 * 
 * 1. 拦截回调 URL，主动提取 access_token 和各种参数, 写入本地 session。
 * 2. 重新进行路由跳转。
 *
 * [使用方法]
 * 
 * // 写在 main.ts 中, auth.init() 之后;
 * import { auth } from '@/stores/auth'
 * import { handleAuthCallback } from '@/utils/handleAuthCallback'
 * ...
 * await auth.init() // 确保认证状态已初始化
 * await handleAuthCallback() // 处理认证回调URL
 */


// 回调 URL 示例（magic link/email confirmation）：
// https://your-app.com/#/access_token=...&expires_at=1772025904&expires_in=3600&refresh_token=...&token_type=bearer&type=signup
// https://your-app.com/#/error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=

import { supabase } from '@/utils/supabase'

// 👇 直接解析
export async function handleAuthCallback() {
  const hash = window.location.hash
  // 匹配 #/access_token= 或 #access_token=
  if (hash.includes('access_token')) {
    const cleaned = hash.startsWith('#/')
      ? hash.slice(2)
      : hash.slice(1)
    
    console.log('Cleaned:', cleaned)
    
    const params = new URLSearchParams(cleaned)

    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    console.log('Extracted tokens from URL:', { access_token, refresh_token })

    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token
      })
      
      console.log('Supabase session set successfully:', data)

      if (error) {
        console.error('Error setting Supabase session:', error)
      } else {
      }
    }
  }
  // 清理 URL
  window.location.hash = ''
}