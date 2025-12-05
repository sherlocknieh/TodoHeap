<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const loading = ref(false)
const email = ref('')

const handleLogin = async () => {
  try {
    loading.value = true
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value,
    })
    if (error) throw error
    alert('Check your email for the login link!')
  } catch (error) {
    if (error instanceof Error) {
      alert(error.message)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1 class="auth-header">Login</h1>
      <p class="description">Sign in via magic link with your email below</p>
      <div class="form-group">
        <input
          class="input-field"
          type="email"
          placeholder="Your email"
          v-model="email"
          @keyup.enter="handleLogin"
        />
      </div>
      <div class="form-group">
        <button
          @click="handleLogin"
          class="submit-btn"
          :disabled="loading"
        >
          {{ loading ? 'Loading' : 'Send magic link' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e5e7eb; /* bg-gray-200 equivalent */
}

.auth-card {
  background: white;
  padding: 2rem; /* p-5 equivalent approx */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); /* shadow */
  width: 100%;
  max-width: 24rem; /* max-w-sm */
  display: flex;
  flex-direction: column;
}

.auth-header {
  font-family: sans-serif;
  font-size: 2.25rem; /* text-4xl */
  text-align: center;
  padding-bottom: 0.5rem; /* pb-2 */
  margin-bottom: 1rem; /* mb-1 approx */
  border-bottom: 1px solid #e5e7eb; /* border-b */
  margin-left: 1rem; /* mx-4 */
  margin-right: 1rem;
  color: #000;
}

.description {
  text-align: center;
  color: #666;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.form-group {
  margin-bottom: 1rem;
}

.input-field {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  box-sizing: border-box; /* Ensure padding doesn't affect width */
}

.submit-btn {
  width: 100%;
  padding: 0.5rem;
  background-color: #000; /* btn-black equivalent */
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-weight: 500;
}

.submit-btn:hover {
  background-color: #333;
}

.submit-btn:disabled {
  background-color: #666;
  cursor: not-allowed;
}
</style>
