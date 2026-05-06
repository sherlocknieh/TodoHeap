<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const ready = ref(false)
const password = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const successMsg = ref('')

onMounted(async () => {
  if (!auth._initialized) {
    await auth.initAuth()
  }

  ready.value = true
})

const handleUpdatePassword = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  if (!auth.isAuthenticated) {
    errorMsg.value = '重置链接已失效，请重新申请密码找回'
    return
  }

  if (!password.value || !confirmPassword.value) {
    errorMsg.value = '请填写新密码并确认'
    return
  }

  if (password.value.length < 6) {
    errorMsg.value = '密码至少需要 6 个字符'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }

  loading.value = true

  try {
    await auth.updatePassword(password.value)
    successMsg.value = '密码已更新，正在跳转...'
    setTimeout(() => {
      router.push('/app')
    }, 1200)
  } catch (error) {
    errorMsg.value = error?.message || '更新密码失败，请重试'
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-400 to-purple-500 dark:from-gray-900 dark:to-gray-800 p-4 relative">
    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 md:p-10 z-10 relative">
      <router-link to="/login" class="absolute left-0 top-0 ml-2 mt-2 flex items-center gap-1 text-indigo-500 dark:text-indigo-300 hover:underline text-sm font-medium">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        返回登录
      </router-link>

      <div class="text-center mb-8">
        <div class="text-5xl mb-2">🔐</div>
        <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">重置密码</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">请输入新的登录密码</p>
      </div>

      <div v-if="!ready" class="text-center text-gray-500 dark:text-gray-400 py-6">
        正在检查重置状态...
      </div>

      <template v-else>
        <div v-if="!auth.isAuthenticated" class="space-y-4">
          <div class="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-700">
            当前没有可用的重置会话，请重新通过邮箱中的密码重置链接进入。
          </div>
          <router-link
            to="/login"
            class="w-full inline-flex items-center justify-center py-3 rounded-lg font-semibold bg-linear-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:from-indigo-600 hover:to-purple-600 transition"
          >
            返回登录页
          </router-link>
        </div>

        <form v-else @submit.prevent="handleUpdatePassword" class="space-y-6">
          <div>
            <label for="newPassword" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">新密码</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-indigo-400">🔒</span>
              <input id="newPassword" v-model="password" type="password" placeholder="请输入新密码" required :disabled="loading"
                class="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition" />
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">密码至少需要 6 个字符</p>
          </div>

          <div>
            <label for="confirmNewPassword" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">确认新密码</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-indigo-400">🔒</span>
              <input id="confirmNewPassword" v-model="confirmPassword" type="password" placeholder="请再次输入新密码" required :disabled="loading"
                class="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition" />
            </div>
          </div>

          <div v-if="errorMsg" class="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-700">
            <span class="text-lg">⚠️</span>
            <span>{{ errorMsg }}</span>
          </div>

          <div v-if="successMsg" class="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-700">
            <span class="text-lg">✅</span>
            <span>{{ successMsg }}</span>
          </div>

          <button type="submit" :disabled="loading"
            class="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-lg bg-linear-to-r from-indigo-500 to-purple-500 dark:from-indigo-700 dark:to-purple-800 text-white shadow-md hover:from-indigo-600 hover:to-purple-600 dark:hover:from-indigo-600 dark:hover:to-purple-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
            <span v-if="loading" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
            {{ loading ? '更新中...' : '更新密码' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>