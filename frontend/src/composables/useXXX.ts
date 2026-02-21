// 可复用逻辑

import { ref } from 'vue'


export function useXXX() {
  // 这里可以放置一些通用的逻辑，比如错误处理、加载状态等
  const error = ref(null)
  const loading = ref(false)
}