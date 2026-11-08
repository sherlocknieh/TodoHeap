// Agent 技能：把一段固定指令保存成可复用入口，运行时在新会话里发给模型
export const MAX_SKILL_NAME = 24
export const MAX_SKILL_PROMPT = 4000
export const SKILL_ICONS = ['sparkles', 'target', 'bulb', 'book', 'chart', 'calendar', 'list', 'clock']
export const DEFAULT_SKILL_ICON = 'sparkles'

export const GLOBAL_OPTIMIZE_PROMPT = `请对当前用户的所有任务做一次全局优化。
步骤：
1. 先用 list_todos 读取全部未完成任务，理解任务树、截止时间与难度。
2. 调整不合理的截止时间，让先后顺序合理；缺少时间的任务按需要补上。
3. 把过于笼统的任务拆成 3-6 个可执行子任务。
4. 合并重复或过碎的任务。
5. 最后创建一条「下一步执行建议」任务。
只调整确实需要改的内容，不要为了改动而改动；不要删除任务或清空回收站。完成后用简短中文说明本次改了什么。`

// 内置技能只在用户从未保存过技能时出现，之后与其他技能一样可编辑、停用或删除
export const DEFAULT_SKILLS = [
  {
    id: 'global-optimize',
    name: '全局任务优化',
    icon: 'target',
    prompt: GLOBAL_OPTIMIZE_PROMPT,
    enabled: true
  }
]

const createSkillId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `skill_${crypto.randomUUID()}`
  return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export const normalizeSkill = (skill, fallbackId) => {
  if (!skill || typeof skill !== 'object') return null
  const name = cleanText(skill.name, MAX_SKILL_NAME)
  const prompt = String(skill.prompt ?? '').trim().slice(0, MAX_SKILL_PROMPT)
  if (!name || !prompt) return null
  return {
    id: typeof skill.id === 'string' && skill.id ? skill.id : (fallbackId || createSkillId()),
    name,
    icon: SKILL_ICONS.includes(skill.icon) ? skill.icon : DEFAULT_SKILL_ICON,
    prompt,
    enabled: skill.enabled !== false
  }
}

// 丢掉重复 id 与空技能，保证列表可直接渲染
export const normalizeSkills = (list) => {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  return list.reduce((skills, item) => {
    const skill = normalizeSkill(item)
    if (!skill || seen.has(skill.id)) return skills
    seen.add(skill.id)
    return [...skills, skill]
  }, [])
}

export const createSkill = ({ name, icon = DEFAULT_SKILL_ICON, prompt } = {}) => ({
  id: createSkillId(),
  name: cleanText(name, MAX_SKILL_NAME),
  icon: SKILL_ICONS.includes(icon) ? icon : DEFAULT_SKILL_ICON,
  prompt: String(prompt ?? '').trim().slice(0, MAX_SKILL_PROMPT),
  enabled: true
})

// 默认技能需要副本，避免调用方修改到模块级常量
export const cloneDefaultSkills = () => DEFAULT_SKILLS.map((skill) => ({ ...skill }))
