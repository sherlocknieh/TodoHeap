<template>
  <!-- 登录/注册页面 -->
  <div class="auth-page">
    <div class="auth-card">
      <!-- 品牌区域 -->
      <div class="brand-section">
        <div class="logo">📝</div>
        <h1>TodoHeap</h1>
        <p class="tagline">简洁高效的待办清单</p>
      </div>

      <!-- 标签切换 -->
      <div class="mode-tabs">
        <button :class="['tab', { active: !isSignUp }]" @click="isSignUp = false">
          登录
        </button>
        <button :class="['tab', { active: isSignUp }]" @click="isSignUp = true">
          注册
        </button>
      </div>

      <!-- 表单 -->
      <form @submit.prevent="handleAuth" class="auth-form">
        <!-- 邮箱输入 -->
        <div class="form-group">
          <label for="email">邮箱地址</label>
          <div class="input-wrapper">
            <span class="input-icon">✉️</span>
            <input id="email" v-model="email" type="email" placeholder="请输入邮箱" required :disabled="loading" />
          </div>
        </div>

        <!-- 密码输入 -->
        <div class="form-group">
          <label for="password">密码</label>
          <div class="input-wrapper">
            <span class="input-icon">🔒</span>
            <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入密码"
              required :disabled="loading" />
            <button type="button" class="toggle-password" @click.prevent="showPassword = !showPassword">
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
          <p v-if="isSignUp" class="password-hint">
            密码至少需要 6 个字符
          </p>
        </div>

        <!-- 确认密码 (仅注册) -->
        <div v-if="isSignUp" class="form-group">
          <label for="confirmPassword">确认密码</label>
          <div class="input-wrapper">
            <span class="input-icon">🔒</span>
            <input id="confirmPassword" v-model="confirmPassword" type="password" placeholder="请再次输入密码" required
              :disabled="loading" />
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="error-box">
          <span class="error-icon">⚠️</span>
          <span>{{ errorMsg }}</span>
        </div>

        <!-- 成功提示 -->
        <div v-if="successMsg" class="success-box">
          <span class="success-icon">✅</span>
          <span>{{ successMsg }}</span>
        </div>

        <!-- 提交按钮 -->
        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? '处理中...' : (isSignUp ? '创建账号' : '登录') }}
        </button>
      </form>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <p v-if="!isSignUp">
          还没有账号?
          <button type="button" class="link-btn" @click="isSignUp = true">
            立即注册
          </button>
        </p>
        <p v-else>
          已有账号?
          <button type="button" class="link-btn" @click="isSignUp = false">
            立即登录
          </button>
        </p>
      </div>
    </div>
    <!-- 装饰元素 -->
    <div class="decoration">
      <div class="decoration-item item-1">🗒️</div>
      <div class="decoration-item item-2">✅</div>
      <div class="decoration-item item-3">🕒</div>
      <div class="decoration-item item-4">📅</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const isSignUp = ref(false)
const showPassword = ref(false)

const handleAuth = async () => {
  // 清空提示信息
  errorMsg.value = ''
  successMsg.value = ''
  authStore.clearError()

  // 基础验证
  if (!email.value || !password.value) {
    errorMsg.value = '请填写所有必填项'
    return
  }

  if (password.value.length < 6) {
    errorMsg.value = '密码至少需要 6 个字符'
    return
  }

  if (isSignUp.value && password.value !== confirmPassword.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }

  try {
    if (isSignUp.value) {
      // 注册
      const result = await authStore.signUp(email.value, password.value)

      if (result.success) {
        if (result.needsVerification) {
          successMsg.value = result.message || '注册成功！请检查邮箱进行验证。'
          // 清空表单
          email.value = ''
          password.value = ''
          confirmPassword.value = ''
          // 2秒后自动切换到登录
          setTimeout(() => {
            isSignUp.value = false
            successMsg.value = ''
          }, 3000)
        } else {
          successMsg.value = '注册成功！正在跳转...'
          setTimeout(() => {
            router.push('/app')
          }, 1000)
        }
      } else {
        errorMsg.value = result.error || '注册失败，请重试'
      }
    } else {
      // 登录
      const result = await authStore.signIn(email.value, password.value)

      if (result.success) {
        successMsg.value = '登录成功！正在跳转...'
        setTimeout(() => {
          router.push('/app')
        }, 1000)
      } else {
        errorMsg.value = result.error || '登录失败，请检查邮箱和密码'
      }
    }
  } catch (error) {
    errorMsg.value = '发生了一个错误，请重试'
    console.error(error)
  }
}
</script>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  position: relative;
}

.auth-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 500px;
  z-index: 10;
}

/* 品牌区域 */
.brand-section {
  text-align: center;
  margin-bottom: 30px;
}

.logo {
  font-size: 48px;
  display: block;
  margin-bottom: 10px;
}

.brand-section h1 {
  font-size: 28px;
  font-weight: 700;
  color: #667eea;
  margin: 10px 0 5px;
}

.tagline {
  font-size: 14px;
  color: #999;
  margin: 0;
}

/* 标签页切换 */
.mode-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
}

.tab {
  flex: 1;
  padding: 12px 20px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: #999;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: -2px;
}

.tab:hover {
  color: #667eea;
}

.tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

/* 表单组 */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

/* 输入框包装器 */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 12px;
  font-size: 18px;
  pointer-events: none;
  color: #667eea;
  z-index: 1;
}

.form-group input {
  width: 100%;
  padding: 12px 40px 12px 40px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  font-family: inherit;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.toggle-password {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #667eea;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.3s ease;
  z-index: 2;
}

.toggle-password:hover {
  color: #764ba2;
}

.password-hint {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}

/* 提示信息 */
.error-box,
.success-box {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.error-box {
  background-color: #fee;
  color: #c33;
  border: 1px solid #fcc;
}

.error-icon {
  font-size: 18px;
}

.success-box {
  background-color: #efe;
  color: #3c3;
  border: 1px solid #cfc;
}

.success-icon {
  font-size: 18px;
}

/* 提交按钮 */
.submit-btn {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 底部链接 */
.auth-footer {
  text-align: center;
  font-size: 14px;
  color: #666;
}

.link-btn {
  background: none;
  border: none;
  color: #667eea;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin: 0 4px;
  transition: color 0.3s ease;
}

.link-btn:hover {
  color: #764ba2;
  text-decoration: underline;
}

/* 装饰元素 */
.decoration {
  display: none;
  position: absolute;
  width: 200px;
  height: 300px;
  pointer-events: none;
}

.decoration-item {
  position: absolute;
  font-size: 60px;
  opacity: 0.1;
  animation: float 6s ease-in-out infinite;
}

.item-1 {
  top: 20px;
  left: 20px;
  animation-delay: 0s;
}

.item-2 {
  top: 80px;
  right: 40px;
  animation-delay: 1s;
}

.item-3 {
  bottom: 80px;
  left: 40px;
  animation-delay: 2s;
}

.item-4 {
  bottom: 20px;
  right: 20px;
  animation-delay: 3s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-20px);
  }
}

/* 响应式设计 */
@media (min-width: 768px) {
  .decoration {
    display: block;
  }
}

@media (max-width: 600px) {
  .auth-page {
    padding: 15px;
  }

  .auth-card {
    padding: 25px;
  }

  .brand-section h1 {
    font-size: 24px;
  }

  .logo {
    font-size: 40px;
  }

  .mode-tabs {
    margin-bottom: 25px;
  }

  .tab {
    padding: 10px 16px;
    font-size: 14px;
  }

  .submit-btn {
    padding: 10px 16px;
    font-size: 14px;
  }

  .brand-section {
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 16px;
  }
}
</style>
