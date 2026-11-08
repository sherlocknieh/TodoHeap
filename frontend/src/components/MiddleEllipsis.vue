<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  text: { type: String, default: '' }
})

const root = ref(null)
const display = ref(String(props.text || ''))

const ELLIPSIS = '…'
let observer = null
let canvas = null

const measure = (value, font) => {
  if (!canvas) canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = font
  return ctx.measureText(value).width
}

// 按容器实际宽度截断成「头…尾」，宽度变化时重新计算
const fit = () => {
  const el = root.value
  const full = String(props.text || '')
  if (!el) return

  const width = el.clientWidth
  if (!width) {
    display.value = full
    return
  }

  const style = window.getComputedStyle(el)
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  if (measure(full, font) <= width) {
    display.value = full
    return
  }

  const budget = Math.max(width - measure(ELLIPSIS, font), 0)

  // 尾部先占六成可用宽度（至少 3 个字符），剩下的宽度留给头部
  const tailTarget = Math.max(budget * 0.6, measure(full.slice(-3), font))
  let tailCount = full.length
  while (tailCount > 1 && measure(full.slice(-tailCount), font) > tailTarget) tailCount -= 1
  const tail = full.slice(-tailCount)

  const headBudget = budget - measure(tail, font)
  let headCount = 0
  for (let i = 1; i <= full.length - tailCount; i += 1) {
    if (measure(full.slice(0, i), font) > headBudget) break
    headCount = i
  }

  display.value = `${full.slice(0, headCount)}${ELLIPSIS}${tail}`
}

onMounted(() => {
  fit()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => fit())
    if (root.value) observer.observe(root.value)
  }
  document.fonts?.ready.then(fit)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(() => props.text, fit)
</script>

<template>
  <!-- 单行展示，超宽时保留头尾、中间省略 -->
  <span ref="root" class="block min-w-0 truncate">{{ display }}</span>
</template>
