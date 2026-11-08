<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'

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
  <!-- 重置密码 -->
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <router-link to="/login"
        class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors">
        <AppIcon name="chevronLeft" :size="13" />
        <span>返回登录</span>
      </router-link>

      <div class="mt-10 mb-6">
        <h1 class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">重置密码</h1>
        <p class="mt-1 text-sm text-neutral-500">设置一个新的登录密码</p>
      </div>

      <p v-if="!ready" class="flex items-center gap-2 text-sm text-neutral-500">
        <AppIcon name="loader" :size="14" class="animate-spin" />
        正在检查重置状态…
      </p>

      <template v-else>
        <!-- 缺少重置会话 -->
        <div v-if="!auth.isAuthenticated" class="space-y-4">
          <p class="text-sm leading-6 text-neutral-500">
            当前没有可用的重置会话，请重新通过邮箱中的密码重置链接进入。
          </p>
          <router-link to="/login" class="btn-primary w-full py-2">
            返回登录页
          </router-link>
        </div>

        <form v-else @submit.prevent="handleUpdatePassword" class="space-y-4">
          <div>
            <label for="newPassword" class="text-xs text-neutral-500">新密码</label>
            <div class="relative mt-1">
              <AppIcon name="lock" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input id="newPassword" v-model="password" type="password" placeholder="至少 6 个字符" required
                :disabled="loading" class="field pl-8" />
            </div>
          </div>

          <div>
            <label for="confirmNewPassword" class="text-xs text-neutral-500">确认新密码</label>
            <div class="relative mt-1">
              <AppIcon name="lock" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input id="confirmNewPassword" v-model="confirmPassword" type="password" placeholder="再次输入新密码"
                required :disabled="loading" class="field pl-8" />
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
            <span>{{ loading ? '更新中…' : '更新密码' }}</span>
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
