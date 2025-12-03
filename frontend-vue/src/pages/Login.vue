<template>
  <div class="login-container">
    <h2>{{ isSignUp ? '注册' : '登录' }}</h2>
    <form @submit.prevent="handleAuth">
      <input v-model="email" type="email" placeholder="邮箱" required />
      <input v-model="password" type="password" placeholder="密码" required />
      <button type="submit">{{ isSignUp ? '注册' : '登录' }}</button>
    </form>
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    <p class="toggle-mode">
      {{ isSignUp ? '已有账号？' : '没有账号？' }}
      <span @click="isSignUp = !isSignUp">{{ isSignUp ? '去登录' : '去注册' }}</span>
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const isSignUp = ref(false)

const handleAuth = async () => {
  errorMsg.value = ''
  
  if (isSignUp.value) {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value
    })
    if (error) {
      errorMsg.value = error.message
    } else {
      alert('注册成功！请检查邮箱进行验证。')
    }
  } else {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (error) {
      errorMsg.value = error.message
      return
    }

    // 登录成功
    console.log('用户信息:', data.user)
    // App.vue 会监听 auth 状态变化并自动切换视图
  }
}
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: auto;
  padding: 2rem;
}
input {
  display: block;
  margin: 0.5rem 0;
  padding: 0.5rem;
  width: 100%;
}
button {
  padding: 0.5rem 1rem;
}
.error {
  color: red;
}
.toggle-mode {
  margin-top: 1rem;
  text-align: center;
}
.toggle-mode span {
  color: blue;
  cursor: pointer;
  text-decoration: underline;
}
</style>
