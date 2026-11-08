<template>
  <!-- 设置：整页铺满视口，浮窗则以卡片形式覆盖在当前页面上 -->
  <Teleport to="body" :disabled="!floating">
    <div :class="floating
      ? 'fixed inset-0 z-[80] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-sm'
      : 'min-h-screen'" @click.self="floating && handleClose()">
      <div :class="floating
        ? 'panel w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6 shadow-xl'
        : 'w-full px-6 md:px-10 lg:px-16 py-8'">
        <!-- 顶栏 -->
        <header class="flex items-start justify-between mb-6">
          <div>
            <h1 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">设置</h1>
            <p class="mt-0.5 text-xs text-neutral-500">账户与 AI 偏好</p>
          </div>
          <div class="flex items-center gap-1 -mr-2">
            <button v-if="floating"
              class="p-2 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
              @click="handleExpand" title="在整页打开" aria-label="在整页打开">
              <AppIcon name="expand" :size="16" />
            </button>
            <button v-else
              class="p-2 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
              @click="handleFloat" title="切换为浮窗" aria-label="切换为浮窗">
              <AppIcon name="shrink" :size="16" />
            </button>
            <button class="p-2 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
              @click="handleClose" aria-label="关闭设置">
              <AppIcon name="close" :size="16" />
            </button>
          </div>
        </header>

        <div class="grid md:grid-cols-[168px_1fr] grid-cols-1 gap-6">
          <!-- 标签 -->
          <nav class="flex md:flex-col gap-1" role="tablist">
            <button v-for="tab in tabs" :key="tab.id" :class="[
              'flex items-center gap-2 px-2.5 py-1.5 text-sm rounded border-l-2 transition-colors text-left',
              activeTab === tab.id
                ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium border-accent-600 dark:border-accent-400'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-200'
            ]" role="tab" :aria-selected="activeTab === tab.id" @click="activeTab = tab.id">
              <AppIcon :name="tab.icon" :size="15" class="opacity-70" />
              <span>{{ tab.label }}</span>
            </button>
          </nav>

          <!-- 内容 -->
          <div class="panel min-h-[25rem] p-6">
            <!-- 账户 -->
            <section v-if="activeTab === 'account'" class="space-y-8">
              <div>
                <p class="eyebrow mb-2">账户信息</p>
                <dl class="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
                  <div class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">邮箱</dt>
                    <dd class="text-neutral-900 dark:text-neutral-100 break-all">{{ userEmail }}</dd>
                  </div>
                  <div class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">创建时间</dt>
                    <dd class="text-neutral-900 dark:text-neutral-100">{{ userCreatedAt }}</dd>
                  </div>
                  <div v-if="userEmailVerified" class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">验证状态</dt>
                    <dd class="flex items-center gap-1.5 text-accent-700 dark:text-accent-400">
                      <AppIcon name="check" :size="13" />
                      <span>已验证</span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <p class="eyebrow mb-2">安全</p>
                <button class="btn-outline" @click="showPasswordModal = true">
                  <AppIcon name="lock" :size="14" />
                  <span>修改密码</span>
                </button>
              </div>

              <div>
                <p class="eyebrow mb-2">账户操作</p>
                <button
                  class="btn border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  @click="handleDeleteAccount" :disabled="isDeletingAccount">
                  <AppIcon name="trash" :size="14" />
                  <span>{{ isDeletingAccount ? '删除中…' : '删除账户' }}</span>
                </button>
              </div>
            </section>

            <!-- 偏好 -->
            <section v-else-if="activeTab === 'preferences'" class="space-y-4">
              <p class="eyebrow">AI 偏好</p>

              <div class="flex items-start justify-between gap-6">
                <div>
                  <p class="text-sm text-neutral-900 dark:text-neutral-100">AI 分解后自动添加任务</p>
                  <p class="mt-0.5 text-xs text-neutral-500">开启后，分解结果直接写入任务列表，不再进入待确认状态。</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input v-model="settingsForm.autoApplyAITasks" type="checkbox" class="sr-only peer" />
                  <div class="w-9 h-5 rounded-full bg-neutral-300 dark:bg-neutral-700 peer-checked:bg-accent-600 transition-colors"></div>
                  <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                </label>
              </div>

              <p v-if="settingsError" class="text-xs text-rose-600 dark:text-rose-400">{{ settingsError }}</p>
              <p v-if="settingsSuccess" class="text-xs text-accent-700 dark:text-accent-400">{{ settingsSuccess }}</p>

              <div class="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <span v-if="settingsLoading" class="text-xs text-neutral-500">读取中…</span>
                <button class="btn-primary" :disabled="settingsLoading || settingsSaving" @click="handleSaveSettings">
                  {{ settingsSaving ? '保存中…' : '保存' }}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <!-- 修改密码 -->
      <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0"
        leave-active-class="transition ease-in duration-100" leave-to-class="opacity-0">
        <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
          <div class="panel w-11/12 max-w-sm p-5 shadow-xl">
            <div class="flex items-start justify-between mb-4">
              <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">修改密码</h2>
              <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
                @click="closePasswordModal" aria-label="关闭">
                <AppIcon name="close" :size="14" />
              </button>
            </div>

            <div class="space-y-3">
              <label class="block">
                <span class="text-[11px] text-neutral-500">新密码</span>
                <input id="new-password" v-model="newPassword" type="password" placeholder="至少 6 个字符"
                  autocomplete="new-password" class="field mt-1" />
              </label>
              <label class="block">
                <span class="text-[11px] text-neutral-500">确认新密码</span>
                <input id="confirm-password" v-model="confirmPassword" type="password" placeholder="再次输入新密码"
                  autocomplete="new-password" class="field mt-1" />
              </label>
            </div>

            <p v-if="passwordError" class="mt-3 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AppIcon name="alert" :size="12" />
              <span>{{ passwordError }}</span>
            </p>
            <p v-if="passwordSuccess" class="mt-3 flex items-center gap-1.5 text-xs text-accent-700 dark:text-accent-400">
              <AppIcon name="check" :size="12" />
              <span>{{ passwordSuccess }}</span>
            </p>

            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-outline" @click="closePasswordModal">取消</button>
              <button class="btn-primary" @click="handleChangePassword" :disabled="isChangingPassword">
                {{ isChangingPassword ? '处理中…' : '修改密码' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { DEFAULT_USER_SETTINGS, fetchUserSettings, saveUserSettings } from '@/lib/userSettings'
import { settingsPanelOpen } from '@/utils/settingsPanel'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  floating: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// 关闭设置：浮窗回到当前页面，整页返回上一页
const handleClose = () => {
  if (props.floating) {
    emit('close')
    return
  }
  router.back()
}

// 从整页收为浮窗：回到应用页由它承载浮窗，保留原来的视图
const handleFloat = () => {
  settingsPanelOpen.value = true
  const previous = window.history.state?.back
  if (typeof previous === 'string' && previous.includes('/app')) {
    router.back()
  } else {
    router.push({ name: 'app' })
  }
}

// 从浮窗展开为整页，沿用当前页面的查询参数
const handleExpand = () => {
  emit('close')
  router.push({ name: 'settings', query: route.query })
}

// 浮窗下按 Esc 关闭
const handleKeydown = (event) => {
  if (event.key === 'Escape' && props.floating) {
    emit('close')
  }
}

// 标签配置
const tabs = [
  { id: 'account', label: '账户安全', icon: 'lock' },
  { id: 'preferences', label: '偏好设置', icon: 'sliders' }
]

// 标签切换
const activeTab = ref('account')

// 账户设置
const showPasswordModal = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')
const isChangingPassword = ref(false)
const isDeletingAccount = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsError = ref('')
const settingsSuccess = ref('')
const settingsForm = ref({ ...DEFAULT_USER_SETTINGS })

// 用户信息
const userEmail = computed(() => authStore.user?.email || '未知')
const userEmailVerified = computed(() => authStore.user?.email_confirmed_at !== null)
const userCreatedAt = computed(() => {
  if (authStore.user?.created_at) {
    const date = new Date(authStore.user.created_at)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  return '未知'
})

// 关闭密码修改弹窗
const closePasswordModal = () => {
  showPasswordModal.value = false
  passwordError.value = ''
  passwordSuccess.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

const loadSettings = async () => {
  settingsError.value = ''
  settingsSuccess.value = ''
  settingsLoading.value = true

  try {
    await authStore.initAuth()
    const userId = authStore.user?.id
    const result = await fetchUserSettings(userId)
    if (!result.success) {
      settingsError.value = result.error?.message || '读取设置失败'
      return
    }
    settingsForm.value = { ...result.data }
  } catch (err) {
    settingsError.value = '读取设置失败'
  } finally {
    settingsLoading.value = false
  }
}

const handleSaveSettings = async () => {
  settingsError.value = ''
  settingsSuccess.value = ''
  settingsSaving.value = true

  try {
    const userId = authStore.user?.id
    const result = await saveUserSettings(userId, settingsForm.value)
    if (!result.success) {
      settingsError.value = result.error?.message || '保存设置失败'
      return
    }
    settingsForm.value = { ...result.data }
    settingsSuccess.value = '设置已保存'
    setTimeout(() => {
      settingsSuccess.value = ''
    }, 1800)
  } catch (err) {
    settingsError.value = '保存设置失败'
  } finally {
    settingsSaving.value = false
  }
}

// 修改密码
const handleChangePassword = async () => {
  passwordError.value = ''
  passwordSuccess.value = ''

  // 验证
  if (!newPassword.value || !confirmPassword.value) {
    passwordError.value = '请填写新密码和确认密码'
    return
  }

  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少需要 6 个字符'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的密码不一致'
    return
  }

  isChangingPassword.value = true
  
  try {
    // 调用 Supabase 更新密码 API
    const { error } = await supabase.auth.updateUser({
      password: newPassword.value
    })
    
    if (error) {
      passwordError.value = error.message || '密码修改失败，请重试'
      return
    }
    
    passwordSuccess.value = '密码修改成功！'
    setTimeout(() => {
      closePasswordModal()
    }, 2000)
  } catch (err) {
    passwordError.value = '密码修改失败，请重试'
  } finally {
    isChangingPassword.value = false
  }
}


// 退出登录
const handleSignOut = async () => {
  if (!window.confirm('确定要退出登录吗？')) {
    return
  }

  try {
    await authStore.signOut()
    router.push({ name: 'home' })
  } catch (err) {
    alert('退出登录失败，请稍后重试')
  }
}

// 删除账户
const handleDeleteAccount = async () => {
  if (isDeletingAccount.value) {
    return
  }

  if (!window.confirm('确定要删除账户吗？此操作无法撤销！')) {
    return
  }
  
  if (!window.confirm('再次确认：删除账户后，所有数据将被永久删除')) {
    return
  }

  isDeletingAccount.value = true
  try {
    await authStore.deleteAccount()
    await authStore.signOut()
    alert('账户已删除')
    router.replace({ name: 'home' })
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除账户失败，请稍后重试'
    alert(message)
  } finally {
    isDeletingAccount.value = false
  }
}

onMounted(() => {
  loadSettings()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
