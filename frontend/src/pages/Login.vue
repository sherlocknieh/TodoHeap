<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'

const router = useRouter()
const auth = useAuthStore()


const loading = ref(false)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isSignUp = ref(false)
const showPassword = ref(false)

/**
 * 获取重定向路径
 * 
 * 如果路由查询参数中有 redirect，则返回该路径
 * 否则返回默认路径 '/app'
 */
const getRedirectPath = () => {
  const redirect = router.currentRoute.value.query.redirect
  return (typeof redirect === 'string' && redirect.trim()) ? redirect : '/app'
}


const handleAuth = async () => {
  // 清空提示信息
  errorMsg.value = ''
  successMsg.value = ''

  // 确保认证状态已初始化
  if (!auth._initialized) {
    await auth.initAuth()
  }

  // 基础验证
  if (!email.value || !password.value) {
    errorMsg.value = '请填写所有必填项'
    return
  }

  loading.value = true

  if (password.value.length < 6) {
    errorMsg.value = '密码至少需要 6 个字符'
    loading.value = false
    return
  }

  if (isSignUp.value && password.value !== confirmPassword.value) {
    errorMsg.value = '两次输入的密码不一致'
    loading.value = false
    return
  }

  try {
    if (isSignUp.value) {
      // 注册
      const result = await auth.signUp(email.value, password.value)

      // Supabase 开启邮箱验证时通常返回 session = null
      if (!result.session) {
        successMsg.value = '注册成功！请检查邮箱进行验证。'
        email.value = ''
        password.value = ''
        confirmPassword.value = ''
        setTimeout(() => {
          isSignUp.value = false
          successMsg.value = ''
        }, 3000)
      } else {
        successMsg.value = '注册成功！正在跳转...'
        setTimeout(() => {
          const redirectPath = getRedirectPath()
          router.push(redirectPath)
        }, 1000)
      }
    } else {
      // 登录
      await auth.signInWithPassword(email.value, password.value)
      successMsg.value = '登录成功！正在跳转...'
      setTimeout(() => {
        const redirectPath = getRedirectPath()
        router.push(redirectPath)
      }, 1000)
    }
  } catch (error) {
    errorMsg.value = error?.message || '发生了一个错误，请重试'
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleResetPassword = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  if (!email.value) {
    errorMsg.value = '请先输入邮箱地址'
    return
  }

  loading.value = true

  try {
    await auth.requestPasswordReset(email.value)
    successMsg.value = '重置链接已发送，请查收邮箱'
  } catch (error) {
    errorMsg.value = error?.message || '发送重置邮件失败，请重试'
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleOAuth = async (provider) => {
  // 清空提示信息
  errorMsg.value = ''
  successMsg.value = ''

  try {
    loading.value = true
    await auth.signInWithOAuth(provider)
    // 大多数情况下会发生重定向；若没有，显示提示
    successMsg.value = '正在跳转到第三方授权页面...'
  } catch (err) {
    errorMsg.value = err?.message || '第三方登录失败，请重试'
    console.error(err)
  } finally {
    loading.value = false
  }
}
</script>


<template>
  <!-- 登录/注册：表单收进独立卡片，与页面底色拉开层级 -->
  <div class="min-h-screen flex items-center justify-center p-6 bg-canvas dark:bg-canvas-dark">
    <div class="w-full max-w-sm">
      <router-link to="/"
        class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-accent-800 dark:hover:text-accent-300 transition-colors">
        <AppIcon name="chevronLeft" :size="13" />
        <span>返回主页</span>
      </router-link>

      <div
        class="mt-8 rounded-2xl border border-hairline bg-surface p-6 shadow-[0_18px_40px_-28px_rgb(6_80_48/0.45)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-black/40">
        <div class="mb-6">
          <h1 class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">TodoHeap</h1>
          <p class="mt-1 text-sm text-neutral-500">任务堆，始终知道下一步做什么</p>
        </div>

        <!-- 登录 / 注册 -->
        <div class="flex gap-5 border-b border-hairline dark:border-hairline-dark mb-6">
          <button :class="[
            'pb-2 -mb-px text-sm border-b-2 transition-colors',
            !isSignUp
              ? 'border-accent-600 dark:border-accent-400 text-accent-800 dark:text-accent-300 font-medium'
              : 'border-transparent text-neutral-500 hover:text-accent-800 dark:hover:text-accent-300'
          ]" @click="isSignUp = false">
            登录
          </button>
          <button :class="[
            'pb-2 -mb-px text-sm border-b-2 transition-colors',
            isSignUp
              ? 'border-accent-600 dark:border-accent-400 text-accent-800 dark:text-accent-300 font-medium'
              : 'border-transparent text-neutral-500 hover:text-accent-800 dark:hover:text-accent-300'
          ]" @click="isSignUp = true">
            注册
          </button>
        </div>

        <form @submit.prevent="handleAuth" class="space-y-4">
          <div>
            <label for="email" class="text-xs text-neutral-500">邮箱</label>
            <div class="relative mt-1">
              <AppIcon name="mail" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input id="email" v-model="email" type="email" placeholder="you@example.com" required :disabled="loading"
                class="field pl-8" />
            </div>
          </div>

          <div>
            <label for="password" class="text-xs text-neutral-500">密码</label>
            <div class="relative mt-1">
              <AppIcon name="lock" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="至少 6 个字符"
                required :disabled="loading" class="field pl-8 pr-14" />
              <button type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[11px] text-neutral-500 hover:text-accent-800 dark:hover:text-accent-200 transition-colors"
                @click.prevent="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
            <p v-if="isSignUp" class="mt-1.5 text-[11px] text-neutral-400">密码至少需要 6 个字符</p>
            <button v-else type="button" :disabled="loading"
              class="mt-1.5 text-[11px] text-neutral-500 hover:text-accent-800 dark:hover:text-accent-200 transition-colors"
              @click="handleResetPassword">
              忘记密码？
            </button>
          </div>

          <div v-if="isSignUp">
            <label for="confirmPassword" class="text-xs text-neutral-500">确认密码</label>
            <div class="relative mt-1">
              <AppIcon name="lock" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input id="confirmPassword" v-model="confirmPassword" type="password" placeholder="再次输入密码" required
                :disabled="loading" class="field pl-8" />
            </div>
          </div>

          <p v-if="errorMsg" class="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AppIcon name="alert" :size="12" class="mt-0.5" />
            <span>{{ errorMsg }}</span>
          </p>
          <p v-if="successMsg" class="flex items-start gap-1.5 text-xs text-accent-700 dark:text-accent-400">
            <AppIcon name="check" :size="12" class="mt-0.5" />
            <span>{{ successMsg }}</span>
          </p>

          <button type="submit" :disabled="loading" class="btn-primary w-full py-2">
            <AppIcon v-if="loading" name="loader" :size="14" class="animate-spin" />
            <span>{{ loading ? '处理中…' : (isSignUp ? '创建账号' : '登录') }}</span>
          </button>
        </form>

        <div class="my-5 flex items-center gap-3 text-[11px] text-neutral-400">
          <span class="h-px flex-1 bg-hairline dark:bg-hairline-dark"></span>
          <span>或</span>
          <span class="h-px flex-1 bg-hairline dark:bg-hairline-dark"></span>
        </div>

        <button type="button" @click="handleOAuth('github')" :disabled="loading" class="btn-outline w-full py-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12 .297a12 12 0 00-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.35-1.77-1.35-1.77-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.26 1.86 1.26 1.08 1.85 2.83 1.32 3.52 1.01.11-.78.42-1.32.76-1.62-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.28-1.55 3.29-1.23 3.29-1.23.67 1.64.26 2.86.13 3.16.77.84 1.23 1.9 1.23 3.22 0 4.62-2.8 5.64-5.47 5.94.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0012 .297" />
          </svg>
          <span>使用 GitHub 登录</span>
        </button>

        <p class="mt-6 text-center text-xs text-neutral-500">
          <template v-if="!isSignUp">
            还没有账号？
            <button type="button" class="text-accent-800 hover:underline dark:text-accent-300"
              @click="isSignUp = true">注册</button>
          </template>
          <template v-else>
            已有账号？
            <button type="button" class="text-accent-800 hover:underline dark:text-accent-300"
              @click="isSignUp = false">登录</button>
          </template>
        </p>
      </div>
    </div>
  </div>
</template>
