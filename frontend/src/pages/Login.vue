<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
  auth.clearError()

  // 如果初始化失败，尝试强制重试
  if (auth.initFailed) {
    loading.value = true
    try {
      await auth.initialize(true)  // 强制重试
    } catch (err) {
      errorMsg.value = '认证初始化失败，请检查网络连接'
      loading.value = false
      return
    }
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

      if (result.success) {
        if (result.needsVerification) {
          successMsg.value = result.message || '注册成功！请检查邮箱进行验证。'
          // 清空表单
          email.value = ''
          password.value = ''
          confirmPassword.value = ''
          // 3秒后自动切换到登录
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
        errorMsg.value = result.error || '注册失败，请重试'
      }
    } else {
      // 登录
      const result = await auth.signIn(email.value, password.value)

      if (result.success) {
        successMsg.value = '登录成功！正在跳转...'
        setTimeout(() => {
          const redirectPath = getRedirectPath()
          router.push(redirectPath)
        }, 1000)
      } else {
        errorMsg.value = result.error || '登录失败，请检查邮箱和密码'
      }
    }
  } catch (error) {
    errorMsg.value = '发生了一个错误，请重试'
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
  <!-- 登录/注册页面 -->
  <div class="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-400 to-purple-500 dark:from-gray-900 dark:to-gray-800 p-4 relative">
    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 md:p-10 z-10 relative">
      <!-- 返回主页按钮 -->
      <router-link to="/" class="absolute left-0 top-0 ml-2 mt-2 flex items-center gap-1 text-indigo-500 dark:text-indigo-300 hover:underline text-sm font-medium">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        返回主页
      </router-link>
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-2">📝</div>
        <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">TodoHeap</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">简洁高效的待办清单</p>
      </div>

      <!-- 切换登录/注册 -->
      <div class="flex gap-2 mb-8 border-b border-gray-200 dark:border-gray-700">
        <button :class="['flex-1 py-3 font-semibold transition-colors', !isSignUp ? 'text-indigo-600 border-b-2 border-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500']" @click="isSignUp = false">
          登录
        </button>
        <button :class="['flex-1 py-3 font-semibold transition-colors', isSignUp ? 'text-indigo-600 border-b-2 border-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500']" @click="isSignUp = true">
          注册
        </button>
      </div>

      <!-- 表单 -->
      <form @submit.prevent="handleAuth" class="space-y-6">
        <!-- 邮箱输入 -->
        <div>
          <label for="email" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">邮箱地址</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-indigo-400">✉️</span>
            <input id="email" v-model="email" type="email" placeholder="请输入邮箱" required :disabled="loading"
              class="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition" />
          </div>
        </div>

        <!-- 密码输入 -->
        <div>
          <label for="password" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">密码</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-indigo-400">🔒</span>
            <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入密码"
              required :disabled="loading"
              class="w-full pl-10 pr-20 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition" />
            <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold px-2 py-1" @click.prevent="showPassword = !showPassword">
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
          <p v-if="isSignUp" class="text-xs text-gray-400 dark:text-gray-500 mt-2">密码至少需要 6 个字符</p>
        </div>

        <!-- 确认密码 (仅注册) -->
        <div v-if="isSignUp">
          <label for="confirmPassword" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">确认密码</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-indigo-400">🔒</span>
            <input id="confirmPassword" v-model="confirmPassword" type="password" placeholder="请再次输入密码" required :disabled="loading"
              class="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition" />
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-700">
          <span class="text-lg">⚠️</span>
          <span>{{ errorMsg }}</span>
        </div>

        <!-- 成功提示 -->
        <div v-if="successMsg" class="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-700">
          <span class="text-lg">✅</span>
          <span>{{ successMsg }}</span>
        </div>

        <!-- 第三方登录（GitHub） -->
        <div class="mt-4">
          <button type="button" @click="handleOAuth('github')" :disabled="loading"
            class="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-lg bg-gray-800 text-white hover:bg-gray-900 transition disabled:opacity-60 disabled:cursor-not-allowed">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297a12 12 0 00-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.35-1.77-1.35-1.77-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.26 1.86 1.26 1.08 1.85 2.83 1.32 3.52 1.01.11-.78.42-1.32.76-1.62-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.28-1.55 3.29-1.23 3.29-1.23.67 1.64.26 2.86.13 3.16.77.84 1.23 1.9 1.23 3.22 0 4.62-2.8 5.64-5.47 5.94.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0012 .297"/>
            </svg>
            使用 GitHub 登录
          </button>
        </div>

        <!-- 提交按钮 -->
        <button type="submit" :disabled="loading"
          class="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-lg bg-linear-to-r from-indigo-500 to-purple-500 dark:from-indigo-700 dark:to-purple-800 text-white shadow-md hover:from-indigo-600 hover:to-purple-600 dark:hover:from-indigo-600 dark:hover:to-purple-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
          <span v-if="loading" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
          {{ loading ? '处理中...' : (isSignUp ? '创建账号' : '登录') }}
        </button>
      </form>

      <!-- 底部提示 -->
      <div class="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
        <p v-if="!isSignUp">
          还没有账号?
          <button type="button" class="link-btn" @click="isSignUp = true">
            立即注册
          </button>
        </p>
        <p v-else>
          已有账号?
          <button type="button" class="text-indigo-500 dark:text-indigo-400 hover:underline ml-1" @click="isSignUp = false">
            立即登录
          </button>
        </p>
      </div>
    </div>

  </div>
</template>
