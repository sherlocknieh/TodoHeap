// 任务图选中项的可见性修正：节点矩形完整落在可见区时返回 null，不打扰当前视口；
// 出界时给出最小平移；节点比可见区还大时缩到刚好放下并居中（从不放大）。
// 依赖渲染变换 screen = view + world * scale，供 MindMapWrapper 的选中/键盘导航使用。

export const REVEAL_MARGIN = 24

/**
 * @param {object} input
 * @param {{x:number,y:number,scale:number}} input.view   当前视口
 * @param {{x:number,y:number,width:number,height:number}} input.node 节点世界坐标与尺寸
 * @param {{width:number,height:number}} input.viewport    可见区尺寸（已扣右侧浮层）
 * @param {number} [input.margin] 节点与可见区边缘的最小留白
 * @param {number} [input.minScale] 缩放下限，与滚轮缩放一致
 * @returns {{x:number,y:number,scale:number}|null} 需要移动/缩放时的目标视口
 */
export const revealView = ({
  view,
  node,
  viewport,
  margin = REVEAL_MARGIN,
  minScale = 0.15
}) => {
  const { width: availWidth, height: availHeight } = viewport
  if (!(availWidth > 0) || !(availHeight > 0)) return null
  const scale = view.scale > 0 ? view.scale : 1
  const nodeW = node.width * scale
  const nodeH = node.height * scale
  const usableW = Math.max(1, availWidth - margin * 2)
  const usableH = Math.max(1, availHeight - margin * 2)

  // 当前缩放下装得下：只在需要时做最小平移，绝不改变缩放
  if (nodeW <= usableW && nodeH <= usableH) {
    const left = view.x + node.x * scale
    const top = view.y + node.y * scale
    const right = left + nodeW
    const bottom = top + nodeH
    let dx = 0
    let dy = 0
    if (left < margin) dx = margin - left
    else if (right > availWidth - margin) dx = availWidth - margin - right
    if (top < margin) dy = margin - top
    else if (bottom > availHeight - margin) dy = availHeight - margin - bottom
    if (dx === 0 && dy === 0) return null
    return { x: view.x + dx, y: view.y + dy, scale }
  }

  // 节点本身比可见区还大：缩到刚好放下并居中，避免只露出局部
  const fit = Math.max(minScale, Math.min(
    scale,
    usableW / node.width,
    usableH / node.height
  ))
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  return {
    x: availWidth / 2 - centerX * fit,
    y: availHeight / 2 - centerY * fit,
    scale: fit
  }
}
