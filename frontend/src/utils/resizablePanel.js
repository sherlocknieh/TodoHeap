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
