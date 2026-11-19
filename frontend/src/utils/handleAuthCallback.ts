/**
 * @module handleAuthCallback
 *
 * [问题来由]
 *
 * Supabase 的认证流程中，用户注册确认/找回密码后，令牌会拼在回跳地址的 hash 里：
 *   .../TodoHeap/app/#access_token=...&refresh_token=...&type=signup
 * 本应用用 Vue Router 的 Hash 路由，这串参数会被当成路由路径直接渲染 404，
 * Supabase SDK 也没有机会处理。
 *
 * [模块功能]
 *
 * 1. 在路由挂载前拦截回跳地址，把令牌写入 session，再回到应用首页。
 * 2. 找回密码的回跳直接进入重置密码页。
 * 3. 链接过期/被拒（error_code）时回到登录页，并带上原因供 Login.vue 提示。
 *
 * [使用方法]
 *
 * // 写在 main.ts 中，挂载 router 之前：
 * import { handleAuthCallback } from '@/utils/handleAuthCallback'
 * await handleAuthCallback()
 */

import { supabase } from '@/lib/supabase'

// 回调 URL 示例（应用挂在 /TodoHeap/app/，hash 由 Supabase 拼在 base 之后）：
// https://your-app.com/TodoHeap/app/#access_token=...&expires_in=3600&refresh_token=...&token_type=bearer&type=signup
// https://your-app.com/TodoHeap/app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
// 也兼容被 Hash 路由提前改写成 #/access_token=... 的旧链接

// 这些标记说明当前地址承载的是认证回跳，而不是普通深链
const CALLBACK_MARKERS = ['access_token', 'error_code', 'error_description']

export async function handleAuthCallback() {
  const hash = window.location.hash
  // 普通页面（含刷新、深链）不带回跳参数，直接保留当前路由
  if (!CALLBACK_MARKERS.some((marker) => hash.includes(marker))) return

  const params = new URLSearchParams(hash.startsWith('#/') ? hash.slice(2) : hash.slice(1))

  // 邮箱链接过期/已被使用、第三方授权被拒：回登录页说明原因
  const errorCode = params.get('error_code') || params.get('error')
  if (errorCode || params.get('error_description')) {
    window.location.hash = `#/login?reason=${encodeURIComponent(errorCode || 'link_invalid')}`
    return
  }

  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  // 参数残缺的回跳同样没有可用会话，别让它停在 404
  if (!access_token || !refresh_token) {
    window.location.hash = '#/login?reason=link_invalid'
    return
  }

  const isRecovery = params.get('type') === 'recovery'
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })

  if (error) {
    console.error('Error setting Supabase session:', error)
    // 令牌失效：找回密码回重置页（那里会提示重新申请），其余回登录页
    window.location.hash = isRecovery ? '#/reset-password' : '#/login?reason=link_invalid'
    return
  }

  // 处理完回跳参数后离开当前 hash，避免令牌留在地址栏
  window.location.hash = isRecovery ? '#/reset-password' : '#/'
}
