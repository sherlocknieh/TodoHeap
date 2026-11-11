import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKILLS,
  cloneDefaultSkills,
  createSkill,
  normalizeSkills
} from './agentSkills'

describe('agentSkills', () => {
  it('默认技能可编辑且不共享引用', () => {
    const skills = cloneDefaultSkills()
    skills[0].name = '改过的名字'

    expect(DEFAULT_SKILLS[0].name).toBe('全局任务优化')
    expect(skills[0].id).toBe('global-optimize')
    expect(skills[0].prompt).toContain('全局优化')
  })

  it('缺少名称或指令的技能会被丢弃', () => {
    const skills = normalizeSkills([
      { id: 'a', name: '有名字', prompt: '指令' },
      { id: 'b', name: '  ', prompt: '指令' },
      { id: 'c', name: '没指令', prompt: '' },
      null
    ])

    expect(skills).toHaveLength(1)
    expect(skills[0].id).toBe('a')
  })

  it('去重并纠正未知图标', () => {
    const skills = normalizeSkills([
      { id: 'a', name: '技能 A', prompt: '指令', icon: 'unknown' },
      { id: 'a', name: '技能 A 副本', prompt: '指令' }
    ])

    expect(skills).toHaveLength(1)
    expect(skills[0].icon).toBe('sparkles')
  })

  it('技能只绑定已知模式，未知模式回退到默认模式', () => {
    const [bound, unknown, follow] = normalizeSkills([
      { id: 'a', name: '只看任务', prompt: '列出任务', mode: 'list' },
      { id: 'b', name: '写错的模式', prompt: '指令', mode: 'nope' },
      { id: 'c', name: '跟随会话', prompt: '指令' }
    ])
    expect(bound.mode).toBe('list')
    expect(unknown.mode).toBe('plan')
    expect(follow.mode).toBe('')
  })

  it('新建技能带唯一 id', () => {
    const first = createSkill({ name: '周复盘', icon: 'chart', prompt: '总结本周' })
    const second = createSkill({ name: '周复盘', icon: 'chart', prompt: '总结本周' })

    expect(first.id).not.toBe(second.id)
  })
})
