import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Session, User, Provider } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
  const _session = ref<Session | null>(null)
  const _initialized = ref(false)
  const _loading = ref(true)

  async function initAuth() {
    if (_initialized.value) return

    // 先获取当前 session（刷新页面时恢复登录状态）
    const { data: { session } } = await supabase.auth.getSession()
    _session.value = session
    _loading.value = false

    // 然后监听后续的认证状态变化
    supabase.auth.onAuthStateChange((event, session) => {
      _session.value = session
      _loading.value = false
      console.log('Auth State Change:', event)
    })

    _initialized.value = true
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/TodoHeap/`,
      },
    })
    if (error) throw error
    return data
  }

  async function signInWithOAuth(provider: Provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/TodoHeap/`,
      },
    })
    if (error) throw error
    return data
  }

  async function signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function deleteAccount() {
    const { error } = await supabase.rpc('delete_account')
    if (error) throw error
  }

  const isAuthenticated = computed(() => !!_session.value?.user)
  const user = computed<User | null>(() => _session.value?.user ?? null)

  return {
    // state
    _session,
    _initialized,
    _loading,
    // getters
    isAuthenticated,
    user,
    // actions
    initAuth,
    signUp,
    signInWithPassword,
    signInWithOAuth,
    signOut,
    deleteAccount,
  }
})
