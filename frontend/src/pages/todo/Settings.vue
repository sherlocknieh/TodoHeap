<template>
  <!-- 设置界面 -->
  <div class="min-h-screen bg-linear-to-br from-gray-100 via-gray-200 to-blue-100 p-6 relative">
    <!-- 右上角关闭按钮 -->
    <button
      class="absolute top-6 right-6 z-20 bg-white rounded-full shadow hover:bg-gray-100 transition-colors border border-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center"
      style="width: 40px; height: 40px; min-width: 40px; min-height: 40px; padding: 0;"
      @click="handleClose"
      aria-label="关闭设置"
    >
      <span style="font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">×</span>
    </button>
    <div class="max-w-5xl mx-auto mb-8 text-left">
      <h1 class="text-3xl font-extrabold text-gray-800">设置</h1>
    </div>

    <div class="max-w-5xl mx-auto grid md:grid-cols-[200px_1fr] grid-cols-1 gap-6 bg-white rounded-lg overflow-hidden shadow-lg">
      <!-- 左侧标签栏（Tailwind 改写） -->
      <nav class="bg-gray-50 p-4 border-r border-gray-200" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'flex items-center gap-3 w-full p-3 text-sm transition-colors rounded-sm',
            activeTab === tab.id
              ? 'bg-white text-indigo-600 border-r-4 border-indigo-600 font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
          ]"
          role="tab"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          <span class="tab-icon text-lg">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </nav>

      <!-- 右侧内容区 -->
      <div class="p-8">
        <!-- 用户信息/偏好设置 -->
        <div v-if="activeTab === 'userinfo'">
          <h2 class="text-lg font-bold text-gray-800 mt-0 mb-4">AI 智能助手</h2>
          <div class="grid gap-3">
            <div class="p-4 bg-gray-50 rounded-md border border-gray-200">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-gray-800">立即应用 AI 生成的子任务</div>
                  <div class="text-xs text-gray-500 mt-1">
                    开启后，AI 分解的子任务将自动添加到任务列表。关闭后，需要手动确认是否保存。
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="autoApplyAITasks"
                    class="sr-only peer"
                  >
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 账户设置 -->
        <div v-if="activeTab === 'account'">
          <h2 class="text-lg font-bold text-gray-800 mt-0 mb-4">账户信息</h2>
          <div class="grid gap-3">
            <div class="p-4 bg-gray-50 rounded-md border border-gray-200">
              <div class="text-xs text-gray-500 uppercase mb-1">邮箱地址</div>
              <div class="text-sm text-gray-800 wrap-break-word">{{ userEmail }}</div>
            </div>

            <div class="p-4 bg-gray-50 rounded-md border border-gray-200">
              <div class="text-xs text-gray-500 uppercase mb-1">账户创建时间</div>
              <div class="text-sm text-gray-800">{{ userCreatedAt }}</div>
            </div>

            <div v-if="userEmailVerified" class="p-4 bg-gray-50 rounded-md border border-gray-200">
              <div class="text-xs text-gray-500 uppercase mb-1">邮箱验证状态</div>
              <div class="text-sm text-green-600 flex items-center gap-2"> <span class="text-lg">✓</span> 已验证</div>
            </div>
          </div>

          <div class="border-t border-gray-200 my-6"></div>

          <h2 class="text-lg font-bold text-gray-800 mt-6 mb-4">安全</h2>
          <div class="flex gap-3">
            <button class="bg-gray-100 text-gray-800 border border-gray-200 px-4 py-2 rounded-md font-semibold hover:bg-gray-200" @click="showPasswordModal = true">
              <span>🔒</span>
              <span class="ml-2">修改密码</span>
            </button>
          </div>

          <div class="border-t border-gray-200 my-6"></div>

          <h2 class="text-lg font-bold text-gray-800 mt-6 mb-4">账户操作</h2>
          <div class="flex flex-col gap-3">
            <button class="bg-red-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-red-600" @click="handleSignOut">
              <span>🚪</span>
              <span class="ml-2">退出登录</span>
            </button>
            <button class="border-2 border-red-500 text-red-500 px-4 py-2 rounded-md hover:bg-red-50" @click="handleDeleteAccount">
              <span>🗑️</span>
              <span class="ml-2">删除账户</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
        <Transition
          enter-active-class="transition ease-out duration-200"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-150"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
              <div class="bg-white rounded-lg shadow-xl w-11/12 max-w-md overflow-hidden" v-if="showPasswordModal">
                <div class="flex justify-between items-center p-6 border-b">
                  <h2 class="text-lg font-semibold">修改密码</h2>
                  <button class="text-gray-400 hover:text-gray-700" @click="closePasswordModal" aria-label="关闭">×</button>
                </div>

                <div class="p-6">
                  <div class="mb-4">
                    <label for="current-password" class="block mb-2 text-sm font-medium text-gray-700">当前密码</label>
                    <input id="current-password" v-model="currentPassword" type="password" placeholder="请输入当前密码" autocomplete="current-password" class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>

                  <div class="mb-4">
                    <label for="new-password" class="block mb-2 text-sm font-medium text-gray-700">新密码</label>
                    <input id="new-password" v-model="newPassword" type="password" placeholder="请输入新密码（至少6个字符）" autocomplete="new-password" class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <div class="mt-2 text-xs text-gray-500">密码长度至少6个字符</div>
                  </div>

                  <div class="mb-4">
                    <label for="confirm-password" class="block mb-2 text-sm font-medium text-gray-700">确认新密码</label>
                    <input id="confirm-password" v-model="confirmPassword" type="password" placeholder="请再次输入新密码" autocomplete="new-password" class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>

                  <div v-if="passwordError" class="mt-4 p-3 bg-red-50 text-red-700 border border-red-100 rounded-md text-sm flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{{ passwordError }}</span>
                  </div>
                  <div v-if="passwordSuccess" class="mt-4 p-3 bg-green-50 text-green-700 border border-green-100 rounded-md text-sm flex items-center gap-2">
                    <span>✓</span>
                    <span>{{ passwordSuccess }}</span>
                  </div>
                </div>

                <div class="p-6 border-t flex gap-3 justify-end">
                  <button class="bg-gray-100 text-gray-800 border border-gray-200 px-4 py-2 rounded-md" @click="closePasswordModal">取消</button>
                  <button class="bg-linear-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-md font-semibold" @click="handleChangePassword" :disabled="isChangingPassword">
                    <span v-if="isChangingPassword">处理中...</span>
                    <span v-else>修改密码</span>
                  </button>
                </div>
              </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { supabase } from '@/utils/supabase'
import { storeToRefs } from 'pinia'

const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

// 设置项
const { autoApplyAITasks } = storeToRefs(settingsStore)

// 关闭设置页，返回上一页
const handleClose = () => {
  router.back()
}

// 标签配置
const tabs = [
  { id: 'userinfo', label: '用户信息', icon: '👤' },
  { id: 'account', label: '账户安全', icon: '🔒' }
]

// 标签切换
const activeTab = ref('userinfo')

// 账户设置
const showPasswordModal = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')
const isChangingPassword = ref(false)

// 主题/通知/隐私 设置已移除

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

onMounted(() => {
  // 以前用于恢复本地设置的逻辑已移除
})

// 关闭密码修改弹窗
const closePasswordModal = () => {
  showPasswordModal.value = false
  passwordError.value = ''
  passwordSuccess.value = ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

// 修改密码
const handleChangePassword = async () => {
  passwordError.value = ''
  passwordSuccess.value = ''

  // 验证
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = '请填写所有字段'
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

  if (newPassword.value === currentPassword.value) {
    passwordError.value = '新密码不能与旧密码相同'
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
  if (window.confirm('确定要退出登录吗？')) {
    const result = await authStore.signOut()
    if (result.success) {
      router.push('/login')
    }
  }
}

// 删除账户
const handleDeleteAccount = async () => {
  if (!window.confirm('确定要删除账户吗？此操作无法撤销！')) {
    return
  }
  
  if (!window.confirm('再次确认：删除账户后，所有数据将被永久删除')) {
    return
  }
  
  // 删除账户功能需要后端支持
  alert('账户删除功能开发中，请联系管理员')
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 24px;
}

.settings-header {
  max-width: 1200px;
  margin: 0 auto 32px;
  text-align: left;
}

.settings-header h1 {
  font-size: 32px;
  font-weight: 800;
  color: #1f2937;
  margin: 0;
}

.subtitle {
  margin-top: 8px;
  color: #6b7280;
  font-size: 14px;
}

.section-desc {
  margin-top: 4px;
  margin-bottom: 20px;
  color: #6b7280;
  font-size: 14px;
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 24px;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

/* 侧边栏样式已替换为 Tailwind CSS */

/* 右侧内容区 */
.settings-content {
  padding: 32px;
}

.setting-section h2 {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin: 24px 0 16px;
}

.setting-section h2:first-child {
  margin-top: 0;
}

/* 信息组 */
.info-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.info-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.info-item label {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.info-value {
  font-size: 16px;
  color: #1f2937;
  font-weight: 500;
  word-break: break-all;
}

.info-value.verified {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #059669;
}

.verified-icon {
  font-size: 18px;
}

/* 操作组 */
.action-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-group.danger {
  flex-direction: column;
}

/* 分割线 */
.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 24px 0;
}

/* 主题与通知相关样式已移除 */

/* 按钮 */
.btn-primary,
.btn-secondary,
.btn-danger,
.btn-danger-outline {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
  transform: translateY(-2px);
}

.btn-danger-outline {
  background: transparent;
  color: #ef4444;
  border: 2px solid #ef4444;
}

.btn-danger-outline:hover {
  background: #fef2f2;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #1f2937;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 24px;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #1f2937;
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-of-type {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #374151;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.error-message {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.success-message {
  margin-top: 12px;
  padding: 10px 12px;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon,
.success-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.modal-footer {
  padding: 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 响应式 */
@media (max-width: 768px) {
  .settings-container {
    grid-template-columns: 1fr;
  }


  .settings-content {
    padding: 20px;
  }

  .theme-options {
    grid-template-columns: 1fr;
  }

  .modal-content {
    width: 95%;
  }
}
</style>
