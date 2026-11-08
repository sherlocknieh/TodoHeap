import { onBeforeUnmount, ref } from 'vue'
import { persistedRef } from './uiState'

// 面板边缘拖拽调宽：宽度本地保留，拖过最小宽度即收起面板
export const useResizablePanel = ({ key, initial, min, side, onCollapse }) => {
	const width = persistedRef(key, initial, {
		validate: (value) => Number.isFinite(value) && value >= min
	})
	const resizing = ref(false)
	let detach = null

	// 给主内容留出空间，两侧各自拖宽也不会把中栏挤没
	const maxWidth = () => Math.max(min, Math.min(720, window.innerWidth - 480))

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
		const startX = event.clientX
		const startWidth = width.value

		const move = (e) => {
			const delta = side === 'left' ? e.clientX - startX : startX - e.clientX
			const next = startWidth + delta
			// 拖过最小宽度后收起，本次拖拽不改动已记住的宽度
			if (next < min) {
				width.value = startWidth
				stop()
				onCollapse()
				return
			}
			width.value = Math.min(Math.round(next), maxWidth())
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

	return { width, resizing, start }
}
