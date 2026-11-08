import { onBeforeUnmount, ref } from 'vue'
import { persistedRef } from './uiState'

// 面板边缘拖拽调宽：宽度本地保留，拖过最小宽度后还要再拖一段才收起面板
export const useResizablePanel = ({ key, initial, min, side, onCollapse }) => {
	const width = persistedRef(key, initial, {
		validate: (value) => Number.isFinite(value) && value >= min
	})
	const resizing = ref(false)
	// 已拖到最小宽度、继续拖就会收起，用于给出即将收起的提示
	const collapseArmed = ref(false)
	// 越过最小宽度后还需继续拖动的距离：半个最小宽度，手抖不会误关
	const collapseDistance = min / 2
	let detach = null

	// 给主内容留出空间，两侧各自拖宽也不会把中栏挤没
	const maxWidth = () => Math.max(min, Math.min(720, window.innerWidth - 480))

	const stop = () => {
		if (!resizing.value) return
		resizing.value = false
		collapseArmed.value = false
		detach?.()
		detach = null
		document.body.classList.remove('select-none')
	}

	const start = (event) => {
		if (event.pointerType === 'mouse' && event.button !== 0) return
		event.preventDefault()
		const startX = event.clientX
		const startWidth = width.value

		const move = (e) => {
			// 忽略未按下按键的移动：窗口外松手或外部合成的移动不应改动宽度
			if (e.buttons === 0) return
			const delta = side === 'left' ? e.clientX - startX : startX - e.clientX
			const next = startWidth + delta
			// 越过最小宽度后先停在最小宽度，再拖够半个最小宽度才收起
			if (next < min - collapseDistance) {
				width.value = startWidth
				stop()
				onCollapse()
				return
			}
			collapseArmed.value = next < min
			width.value = Math.min(Math.max(Math.round(next), min), maxWidth())
		}

		resizing.value = true
		collapseArmed.value = false
		document.body.classList.add('select-none')
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
		detach = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
		}
	}

	onBeforeUnmount(stop)

	return { width, resizing, collapseArmed, start }
}

// 底部面板拖拽调高：向上拖增大高度，高度本地保留，限制在视口可用范围内
export const useResizableHeight = ({ key, initial, min }) => {
	const height = persistedRef(key, initial, {
		validate: (value) => Number.isFinite(value) && value >= min
	})
	const resizing = ref(false)
	let detach = null

	// 给上方内容留出空间：最多占视口高度减去头部与输入区
	const maxHeight = () => Math.max(min, window.innerHeight - 320)

	const stop = () => {
		if (!resizing.value) return
		resizing.value = false
		detach?.()
		detach = null
		document.body.classList.remove('select-none')
	}

	const start = (event) => {
		if (event.pointerType === 'mouse' && event.button !== 0) return
		event.preventDefault()
		const startY = event.clientY
		const startHeight = height.value

		const move = (e) => {
			// 忽略未按下按键的移动：窗口外松手不应改动高度
			if (e.buttons === 0) return
			const next = startHeight + (startY - e.clientY)
			height.value = Math.min(Math.max(Math.round(next), min), maxHeight())
		}

		resizing.value = true
		document.body.classList.add('select-none')
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
		detach = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
		}
	}

	onBeforeUnmount(stop)

	return { height, resizing, start }
}
