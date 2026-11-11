// 对话图片：读取、压缩与本地持久化；消息里只留元数据，图片本体存 IndexedDB
import localforage from 'localforage'

const imageStorage = localforage.createInstance({
  name: 'todoheap',
  storeName: 'agentImages'
})

export const MAX_IMAGES_PER_MESSAGE = 4
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_EDGE = 1280
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export const isSupportedImage = (file) => Boolean(file) && ACCEPTED_TYPES.includes(file.type)

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('图片读取失败'))
  reader.readAsDataURL(file)
})

const loadElement = (url) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('图片解码失败'))
  image.src = url
})

// 长边压到 1280 以内：截图里的文字仍可辨认，请求体积也可控
const downscale = async (dataUrl, mime) => {
  const image = await loadElement(dataUrl)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  if (scale === 1 && dataUrl.length < 400_000) {
    return { dataUrl, width: image.width, height: image.height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)

  // GIF 动图压成静态 PNG，其余优先 WebP；浏览器不支持时退回 JPEG
  const preferred = mime === 'image/gif' ? 'image/png' : 'image/webp'
  let output = canvas.toDataURL(preferred, 0.85)
  if (!output.startsWith(`data:${preferred}`)) output = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl: output, width: canvas.width, height: canvas.height }
}

// 把用户选中的文件转成可发送的附件；图片本体同时写入 IndexedDB 供刷新后恢复
export const createImageAttachment = async (file) => {
  if (!isSupportedImage(file)) throw new Error('仅支持 PNG、JPEG、WebP、GIF 图片')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 10MB')

  const raw = await readAsDataUrl(file)
  const { dataUrl, width, height } = await downscale(raw, file.type)
  const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || file.type
  const attachment = {
    id: createId(),
    name: file.name || '粘贴的图片',
    mime,
    width,
    height,
    size: dataUrl.length,
    dataUrl
  }

  await imageStorage.setItem(attachment.id, dataUrl).catch(() => {})
  return attachment
}

// 刷新后按 id 取回图片本体，缺失的条目保持无图状态
export const hydrateImages = async (images) => {
  const pending = (Array.isArray(images) ? images : []).filter((image) => image?.id && !image.dataUrl)
  await Promise.all(pending.map(async (image) => {
    const dataUrl = await imageStorage.getItem(image.id).catch(() => null)
    if (typeof dataUrl === 'string' && dataUrl) image.dataUrl = dataUrl
  }))
}

export const removeStoredImages = (images) => {
  (Array.isArray(images) ? images : []).forEach((image) => {
    if (image?.id) imageStorage.removeItem(image.id).catch(() => {})
  })
}
