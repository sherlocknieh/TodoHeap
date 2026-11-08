<script setup>
import { computed, ref } from 'vue'
import { useLlmStore } from '@/stores/llm'
import AppIcon from '@/components/AppIcon.vue'

const llm = useLlmStore()

const draft = ref({ ...llm.config })
const showKey = ref(false)
const status = ref({ type: '', message: '' })
const saving = ref(false)

const preset = computed(() => llm.presets.find((item) => item.id === draft.value.presetId) || null)
const canSave = computed(() => Boolean(draft.value.baseUrl && draft.value.model))

const setStatus = (type, message) => {
  status.value = { type, message }
}

// 切换预设时套用该服务商的地址与首个推荐模型
const handlePresetChange = () => {
  const target = preset.value
  if (!target || target.id === 'custom') return
  draft.value.baseUrl = target.baseUrl
  draft.value.model = target.models[0] || ''
}

const handleSave = () => {
  if (!canSave.value) {
    setStatus('error', 'Base URL 与模型名称不能为空')
    return false
  }
  llm.update(draft.value)
  setStatus('success', '配置已保存在本机浏览器')
  return true
}

// 测试前先保存，避免用户以为测的是当前草稿
const handleTest = async () => {
  if (!handleSave()) return
  saving.value = true
  setStatus('', '')
  const result = await llm.testConnection()
  saving.value = false
  if (result.success) {
    setStatus('success', `${result.message}（${result.elapsedMs} ms）`)
  } else {
    setStatus('error', result.error)
  }
}

const handleReset = () => {
  llm.reset()
  draft.value = { ...llm.config }
  setStatus('success', '已恢复默认配置')
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <p class="eyebrow">模型接入</p>
      <p class="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
        对话 Agent 直接调用你选择的模型服务。配置只保存在本机浏览器，不会上传到服务器。
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="space-y-1.5">
        <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">服务商</span>
        <select v-model="draft.presetId" class="field" @change="handlePresetChange">
          <option v-for="item in llm.presets" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>

      <label class="space-y-1.5">
        <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">模型名称</span>
        <input v-model="draft.model" class="field" list="llm-models" placeholder="如 deepseek-chat" autocomplete="off" />
        <datalist id="llm-models">
          <option v-for="model in preset?.models || []" :key="model" :value="model" />
        </datalist>
      </label>

      <label class="space-y-1.5 sm:col-span-2">
        <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">Base URL</span>
        <input v-model="draft.baseUrl" class="field" placeholder="https://api.example.com/v1" autocomplete="off" />
        <span class="block text-[11px] text-neutral-500 dark:text-neutral-400">需兼容 OpenAI 的 chat/completions 协议，可填到 /v1 层级。</span>
      </label>

      <label class="space-y-1.5 sm:col-span-2">
        <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">API Key</span>
        <div class="flex items-center gap-2">
          <input v-model="draft.apiKey" :type="showKey ? 'text' : 'password'" class="field flex-1"
            placeholder="本地模型可留空" autocomplete="off" spellcheck="false" />
          <button type="button" class="btn-outline px-2 py-1.5" :title="showKey ? '隐藏密钥' : '显示密钥'"
            @click="showKey = !showKey">
            <AppIcon :name="showKey ? 'eyeOff' : 'eye'" :size="14" />
          </button>
        </div>
      </label>
    </div>

    <p class="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      密钥保存在浏览器本地存储中，请使用可随时撤销、限额专用的密钥。
    </p>

    <p v-if="status.message"
      class="text-xs"
      :class="status.type === 'error'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-accent-700 dark:text-accent-400'">
      {{ status.message }}
    </p>

    <div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
      <button class="btn-ghost" @click="handleReset">恢复默认</button>
      <button class="btn-outline" :disabled="saving || !canSave" @click="handleTest">
        <AppIcon :name="saving ? 'loader' : 'cloud'" :size="14" :class="saving ? 'animate-spin' : ''" />
        {{ saving ? '测试中…' : '测试连接' }}
      </button>
      <button class="btn-primary" :disabled="!canSave" @click="handleSave">保存配置</button>
    </div>
  </div>
</template>
