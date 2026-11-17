// 图里「新建后立即编辑」的判定：editTaskId 变化时决定是否迁移编辑目标、是否打开输入框
// 临时 ID 换成真实 ID 与连续新建都会让 editTaskId 变化，必须靠 replaced / editingPrev 区分

const sameId = (a, b) => a != null && b != null && String(a) === String(b)

/**
 * @param {object} input
 * @param {number|string|null} input.id       本次 editTaskId
 * @param {number|string|null} input.prevId   上一次 editTaskId
 * @param {number|string|null} input.consumedId 已经打开过编辑的任务 ID
 * @param {boolean} input.editingPrev         编辑框是否仍停在 prevId 上
 * @param {boolean} input.replaced            prevId 是否就是刚换成 id 的临时 ID
 * @returns {{ remap: boolean, consumedId: number|string|null, shouldStart: boolean }}
 */
export const resolveEditRequest = ({ id, prevId, consumedId, editingPrev, replaced }) => {
  const changed = prevId != null && id != null && !sameId(prevId, id)
  // 同一次新建从临时 ID 换成真实 ID：消费标记跟着走，编辑框也要迁到新元素
  const remap = changed && editingPrev
  let nextConsumed = consumedId
  if (changed && (replaced || editingPrev) && sameId(consumedId, prevId)) {
    nextConsumed = id
  }
  // 没有新的消费标记才算一次要打开编辑的请求；仅 ID 换号时不能重开已提交的输入框
  const shouldStart = id != null && !sameId(id, nextConsumed)
  return { remap, consumedId: nextConsumed, shouldStart }
}
