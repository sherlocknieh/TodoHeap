import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { persistedRef } from './uiState'

// 分区固定高度：与左侧栏一致，副分区展开时统一 192px
export const SECONDARY_SECTION_HEIGHT = 192

// 计算折叠栈各分区高度，纯函数便于单测：
// collapsed 只留标题行；auto 取标题 + 内容自然高度；
// fixed 取固定高度（不低于标题行）；fill 吃掉扣掉其它分区后的剩余空间。
export const computeSectionHeights = ({
  keys,
  modes,
  collapsed,
  headers,
  contents = {},
  total,
  secondary = SECONDARY_SECTION_HEIGHT
}) => {
  const heights = {}
  const isCollapsed = (key) => Boolean(collapsed[key])
  const headerOf = (key) => headers[key] ?? 0
  let used = 0
  let fillKey = null

  for (const key of keys) {
    if (!isCollapsed(key) && modes[key] === 'fill' && !fillKey) {
      fillKey = key
      continue
    }
    if (isCollapsed(key)) {
      heights[key] = headerOf(key)
    } else if (modes[key] === 'fixed') {
      heights[key] = Math.max(headerOf(key), secondary)
    } else {
      heights[key] = headerOf(key) + (contents[key] ?? 0)
    }
    used += heights[key]
  }

  // 主分区吃掉剩余空间；空间不足时至少保留标题行，避免整块被裁掉点不到
  if (fillKey) {
    heights[fillKey] = Math.max(headerOf(fillKey), total - used)
  }

  return heights
}

// 右侧栏分区折叠栈：分区标题可点、折叠状态本地保存。
// 被 TodoDetailEditor / ScheduleDetailPanel / AgentContextPanel 使用；
// 每个分区按 data-section / data-section-header / data-section-content 标记测量。
export const useSectionStack = ({ storageKey, sections, defaults = {}, visible }) => {
  const keys = sections.map((section) => section.key)
  const modes = Object.fromEntries(sections.map((section) => [section.key, section.mode || 'fixed']))

  const collapsed = persistedRef(storageKey, { ...defaults }, {
    validate: (value) => value && typeof value === 'object'
  })

  const isCollapsed = (key) => collapsed.value[key] ?? Boolean(defaults[key])

  const setCollapsed = (key, value) => {
    collapsed.value = { ...collapsed.value, [key]: value }
  }

  const toggleSection = (key) => setCollapsed(key, !isCollapsed(key))
  const expandSection = (key) => setCollapsed(key, false)

  const stackRef = ref(null)
  const sectionHeights = ref({})

  const partOf = (key, part) => stackRef.value?.querySelector(`[data-section="${key}"] ${part}`) ?? null

  // 量出标题行与内容自然高度，再交给纯函数分配
  const measure = () => {
    const stack = stackRef.value
    if (!stack) return
    const total = stack.clientHeight
    if (!total) return

    const headers = {}
    const contents = {}
    for (const key of keys) {
      headers[key] = partOf(key, '[data-section-header]')?.offsetHeight ?? 0
      contents[key] = partOf(key, '[data-section-content]')?.offsetHeight ?? 0
    }

    const states = Object.fromEntries(keys.map((key) => [key, isCollapsed(key)]))
    sectionHeights.value = {
      ...sectionHeights.value,
      ...computeSectionHeights({ keys, modes, collapsed: states, headers, contents, total })
    }
  }

  // 分区容器、自动高度内容变化时重新分配；切面板/展开分区后重新挂观察目标
  let observer = null
  const refresh = () => {
    observer?.disconnect()
    observer = null
    const stack = stackRef.value
    if (!stack) return

    observer = new ResizeObserver(measure)
    observer.observe(stack)
    for (const key of keys) {
      if (modes[key] !== 'auto') continue
      const content = partOf(key, '[data-section-content]')
      if (content) observer.observe(content)
    }
    measure()
  }

  const sectionClass = (key) => [
    'flex flex-col min-h-0 overflow-hidden transition-[height] duration-200 ease-out',
    sectionHeights.value[key] !== undefined || modes[key] !== 'fill' || isCollapsed(key)
      ? 'shrink-0'
      : 'flex-1'
  ]

  const sectionStyle = (key) => {
    const height = sectionHeights.value[key]
    return height === undefined ? null : { height: `${height}px` }
  }

  // 分区容器随选中项出现（任务/日程先开面板后选内容）时补一次测量
  watch(stackRef, (el) => {
    if (el) nextTick(refresh)
  }, { flush: 'post' })

  watch(
    () => keys.map((key) => isCollapsed(key)),
    () => nextTick(measure),
    { flush: 'post' }
  )

  if (visible) {
    watch(visible, (value) => {
      if (value) nextTick(refresh)
    }, { flush: 'post' })
  }

  onMounted(refresh)
  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return {
    stackRef,
    isCollapsed,
    setCollapsed,
    toggleSection,
    expandSection,
    sectionClass,
    sectionStyle,
    refresh
  }
}
