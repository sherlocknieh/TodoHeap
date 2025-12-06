<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// 标签切换
const activeTab = ref('account')

// 账户设置
const showPasswordModal = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')

// 主题设置
const theme = ref('light')

// 通知设置
const notifications = ref({
  email: true,
  push: false,
  reminders: true
})

// 隐私设置
const privacy = ref({
  publicProfile: false,
  shareProgress: false
})

// 用户信息
const userEmail = computed(() => authStore.user?.email || '未知')
const userCreatedAt = computed(() => {
  if (authStore.user?.created_at) {
    return new Date(authStore.user.created_at).toLocaleDateString('zh-CN')
  }
  return '未知'
})

onMounted(() => {
  // 恢复保存的主题设置
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.value = savedTheme
    applyTheme(savedTheme)
  }

  // 恢复保存的通知设置
  const savedNotifications = localStorage.getItem('notifications')
  if (savedNotifications) {
    notifications.value = JSON.parse(savedNotifications)
  }

  // 恢复保存的隐私设置
  const savedPrivacy = localStorage.getItem('privacy')
  if (savedPrivacy) {
    privacy.value = JSON.parse(savedPrivacy)
  }
})

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

  // 这里可以调用更新密码的 API
  // 当前只显示成功提示
  passwordSuccess.value = '密码修改成功！'
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  
  setTimeout(() => {
    showPasswordModal.value = false
    passwordSuccess.value = ''
  }, 2000)
}

// 主题切换
const applyTheme = (selectedTheme) => {
  document.documentElement.setAttribute('data-theme', selectedTheme)
  localStorage.setItem('theme', selectedTheme)
}

const handleThemeChange = (selectedTheme) => {
  theme.value = selectedTheme
  applyTheme(selectedTheme)
}

// 保存通知设置
const handleNotificationChange = () => {
  localStorage.setItem('notifications', JSON.stringify(notifications.value))
}

// 保存隐私设置
const handlePrivacyChange = () => {
  localStorage.setItem('privacy', JSON.stringify(privacy.value))
}

// 退出登录
const handleSignOut = async () => {
  if (confirm('确定要退出登录吗?')) {
    const result = await authStore.signOut()
    if (result.success) {
      router.push('/login')
    }
  }
}

// 删除账户
const handleDeleteAccount = async () => {
  if (confirm('确定要删除账户吗? 此操作无法撤销!')) {
    if (confirm('再次确认:删除账户后,所有数据将被永久删除')) {
      // 这里应该调用删除账户的 API
      alert('账户删除功能开发中...')
    }
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>⚙️ 设置</h1>
      <p class="subtitle">管理您的账户和应用偏好</p>
    </div>

    <div class="settings-container">
      <!-- 左侧标签栏 -->
      <div class="tabs-sidebar">
        <button
          v-for="tab in ['account', 'theme', 'notifications', 'privacy']"
          :key="tab"
          :class="['tab-item', { active: activeTab === tab }]"
          @click="activeTab = tab"
        >
          <span class="tab-icon">
            {{ tab === 'account' ? '👤' : tab === 'theme' ? '🎨' : tab === 'notifications' ? '🔔' : '🔒' }}
          </span>
          <span class="tab-label">
            {{ tab === 'account' ? '账户' : tab === 'theme' ? '主题' : tab === 'notifications' ? '通知' : '隐私' }}
          </span>
        </button>
      </div>

      <!-- 右侧内容区 -->
      <div class="settings-content">
        <!-- 账户设置 -->
        <div v-if="activeTab === 'account'" class="setting-section">
          <h2>账户信息</h2>
          <div class="info-group">
            <div class="info-item">
              <label>邮箱地址</label>
              <div class="info-value">{{ userEmail }}</div>
            </div>
            <div class="info-item">
              <label>账户创建时间</label>
              <div class="info-value">{{ userCreatedAt }}</div>
            </div>
          </div>

          <div class="divider"></div>

          <h2>安全</h2>
          <div class="action-group">
            <button class="btn-secondary" @click="showPasswordModal = true">
              修改密码
            </button>
          </div>

          <div class="divider"></div>

          <h2>退出账户</h2>
          <div class="action-group danger">
            <button class="btn-danger" @click="handleSignOut">
              退出登录
            </button>
            <button class="btn-danger-outline" @click="handleDeleteAccount">
              删除账户
            </button>
          </div>
        </div>

        <!-- 主题设置 -->
        <div v-if="activeTab === 'theme'" class="setting-section">
          <h2>外观主题</h2>
          <div class="theme-options">
            <div class="theme-item">
              <input
                type="radio"
                id="light-theme"
                value="light"
                :checked="theme === 'light'"
                @change="handleThemeChange('light')"
              />
              <label for="light-theme" class="theme-label">
                <div class="theme-preview light"></div>
                <div class="theme-name">浅色</div>
                <div class="theme-desc">明亮的界面,适合白天使用</div>
              </label>
            </div>

            <div class="theme-item">
              <input
                type="radio"
                id="dark-theme"
                value="dark"
                :checked="theme === 'dark'"
                @change="handleThemeChange('dark')"
              />
              <label for="dark-theme" class="theme-label">
                <div class="theme-preview dark"></div>
                <div class="theme-name">深色</div>
                <div class="theme-desc">暗色的界面,保护眼睛</div>
              </label>
            </div>
          </div>
        </div>

        <!-- 通知设置 -->
        <div v-if="activeTab === 'notifications'" class="setting-section">
          <h2>通知偏好</h2>
          <div class="toggle-group">
            <div class="toggle-item">
              <div>
                <div class="toggle-title">邮件通知</div>
                <div class="toggle-desc">接收重要更新和提醒的邮件</div>
              </div>
              <label class="toggle-switch">
                <input
                  v-model="notifications.email"
                  type="checkbox"
                  @change="handleNotificationChange"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div>
                <div class="toggle-title">推送通知</div>
                <div class="toggle-desc">接收浏览器推送通知</div>
              </div>
              <label class="toggle-switch">
                <input
                  v-model="notifications.push"
                  type="checkbox"
                  @change="handleNotificationChange"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div>
                <div class="toggle-title">任务提醒</div>
                <div class="toggle-desc">接收待办任务到期前的提醒</div>
              </div>
              <label class="toggle-switch">
                <input
                  v-model="notifications.reminders"
                  type="checkbox"
                  @change="handleNotificationChange"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 隐私设置 -->
        <div v-if="activeTab === 'privacy'" class="setting-section">
          <h2>隐私和共享</h2>
          <div class="toggle-group">
            <div class="toggle-item">
              <div>
                <div class="toggle-title">公开个人资料</div>
                <div class="toggle-desc">允许其他用户查看您的个人资料</div>
              </div>
              <label class="toggle-switch">
                <input
                  v-model="privacy.publicProfile"
                  type="checkbox"
                  @change="handlePrivacyChange"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div>
                <div class="toggle-title">分享进度统计</div>
                <div class="toggle-desc">允许我们收集使用数据以改进服务</div>
              </div>
              <label class="toggle-switch">
                <input
                  v-model="privacy.shareProgress"
                  type="checkbox"
                  @change="handlePrivacyChange"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <div v-if="showPasswordModal" class="modal-overlay" @click.self="showPasswordModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>修改密码</h2>
          <button class="close-btn" @click="showPasswordModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="current-password">当前密码</label>
            <input
              id="current-password"
              v-model="currentPassword"
              type="password"
              placeholder="请输入当前密码"
            />
          </div>

          <div class="form-group">
            <label for="new-password">新密码</label>
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              placeholder="请输入新密码(至少6个字符)"
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">确认新密码</label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
            />
          </div>

          <div v-if="passwordError" class="error-message">
            {{ passwordError }}
          </div>
          <div v-if="passwordSuccess" class="success-message">
            {{ passwordSuccess }}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="showPasswordModal = false">
            取消
          </button>
          <button class="btn-primary" @click="handleChangePassword">
            修改密码
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

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

/* 左侧标签栏 */
.tabs-sidebar {
  background: #f9fafb;
  padding: 16px 0;
  border-right: 1px solid #e5e7eb;
}

.tab-item {
  width: 100%;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  transition: all 0.2s ease;
}

.tab-item:hover {
  background: #f3f4f6;
  color: #374151;
}

.tab-item.active {
  background: white;
  color: #667eea;
  border-right: 3px solid #667eea;
  font-weight: 600;
}

.tab-icon {
  font-size: 18px;
}

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

/* 主题选项 */
.theme-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.theme-item {
  position: relative;
}

.theme-item input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.theme-label {
  display: block;
  padding: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
}

.theme-item input:checked + .theme-label {
  border-color: #667eea;
  background: #f0f4ff;
}

.theme-preview {
  width: 100%;
  height: 80px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.theme-preview.light {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}

.theme-preview.dark {
  background: #1f2937;
}

.theme-name {
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.theme-desc {
  font-size: 12px;
  color: #9ca3af;
}

/* 切换组 */
.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toggle-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.toggle-title {
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.toggle-desc {
  font-size: 13px;
  color: #9ca3af;
}

/* 切换开关 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #667eea;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

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

.error-message {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 6px;
  font-size: 13px;
}

.success-message {
  margin-top: 12px;
  padding: 10px 12px;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  font-size: 13px;
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

  .tabs-sidebar {
    display: flex;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
    overflow-x: auto;
  }

  .tab-item {
    padding: 12px;
    flex-shrink: 0;
    border-right: none;
    border-bottom: 3px solid transparent;
  }

  .tab-item.active {
    border-right: none;
    border-bottom: 3px solid #667eea;
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
