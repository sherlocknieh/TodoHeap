import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setSession } = vi.hoisted(() => ({ setSession: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { setSession } },
}))

import { handleAuthCallback } from '@/utils/handleAuthCallback'

const loadWithHash = (hash) => {
  globalThis.window = { location: { hash } }
}

describe('handleAuthCallback', () => {
  beforeEach(() => {
    setSession.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('普通深链不触碰路由', async () => {
    loadWithHash('#/login?redirect=/list')

    await handleAuthCallback()

    expect(window.location.hash).toBe('#/login?redirect=/list')
    expect(setSession).not.toHaveBeenCalled()
  })

  it('邮箱链接过期时回登录页并带上原因', async () => {
    loadWithHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')

    await handleAuthCallback()

    expect(window.location.hash).toBe('#/login?reason=otp_expired')
    expect(setSession).not.toHaveBeenCalled()
  })

  it('回跳参数残缺时回登录页而不是停在 404', async () => {
    loadWithHash('#access_token=token')

    await handleAuthCallback()

    expect(window.location.hash).toBe('#/login?reason=link_invalid')
    expect(setSession).not.toHaveBeenCalled()
  })

  it('旧式 #/access_token 也能写入 session', async () => {
    loadWithHash('#/access_token=token&refresh_token=refresh&type=signup')
    setSession.mockResolvedValue({ error: null })

    await handleAuthCallback()

    expect(setSession).toHaveBeenCalledWith({ access_token: 'token', refresh_token: 'refresh' })
    expect(window.location.hash).toBe('#/')
  })

  it('找回密码的令牌失效时进入重置密码页', async () => {
    loadWithHash('#access_token=token&refresh_token=refresh&type=recovery')
    setSession.mockResolvedValue({ error: new Error('invalid jwt') })

    await handleAuthCallback()

    expect(window.location.hash).toBe('#/reset-password')
  })

  it('登录类令牌失效时回登录页提示', async () => {
    loadWithHash('#access_token=token&refresh_token=refresh&type=signup')
    setSession.mockResolvedValue({ error: new Error('invalid jwt') })

    await handleAuthCallback()

    expect(window.location.hash).toBe('#/login?reason=link_invalid')
  })
})
