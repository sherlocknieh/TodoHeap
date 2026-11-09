<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 }
})

// 线性图标库：统一 24 网格、1.75 描边，避免混用 emoji 与粗细不一的图标
const ICONS = {
  sidebar: 'M3 4h18v16H3zM9 4v16',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  tree: 'M6 3v12M6 9h5a2 2 0 0 1 2 2v4M13 15h5M6 15a2 2 0 1 0 0 .01',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5M21 16l-9 5-9-5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  sparkles: 'm12 3 1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z',
  user: 'M20 21a8 8 0 0 0-16 0M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  sliders: 'M4 7h8M16 7h4M4 17h4M12 17h8M14 4v6M8 14v6',
  logout: 'M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm18 15-6-6-6 6',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v-5M12 8h.01',
  loader: 'M21 12a9 9 0 1 1-6.219-8.56',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z',
  cloudOff: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10ZM2 2l20 20',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  fileText: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  calendar: 'M4 6h16v14H4zM8 3v4M16 3v4M4 11h16',
  link: 'M10.5 13.5a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M13.5 10.5a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  unlink: 'M10.5 13.5a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M13.5 10.5a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1M3 3l18 18',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11Z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM8 7h7',
  chart: 'M4 20V11M10 20V4M16 20v-6M22 20H2',
  shield: 'M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6z',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3',
  shrink: 'M9 3v4a2 2 0 0 1-2 2H3M15 21v-4a2 2 0 0 1 2-2h4M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
  stop: 'M6 6h12v12H6z',
  key: 'M15 3a6 6 0 1 0 5.2 9L21 13v3h-3v3h-4l-1.2-1.2A6 6 0 0 0 15 3ZM16.5 7.5h.01',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M2 2l20 20M6.7 6.7C3.9 8.4 2 12 2 12s3.5 6 10 6c1.9 0 3.6-.5 5-1.3M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.4 3.2',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'
}

const paths = computed(() => ICONS[props.name] ?? ICONS.info)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path :d="paths" />
  </svg>
</template>
