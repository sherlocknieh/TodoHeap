---
layout: doc
title: 开发指南
outline: deep
---

# 开发指南

欢迎加入 TodoHeap 的开发！本指南帮助你快速上手项目，理解体系，并参与功能开发。

## 快速开始

### 项目地址
https://github.com/sherlocknieh/TodoHeap

### 前置要求
- Node.js 18+
- pnpm 8+
- Git

### 一键启动

```bash
git clone https://github.com/sherlocknieh/TodoHeap.git
cd TodoHeap/frontend
pnpm install
pnpm dev
```

详见 [环境搭建](./01.setup.md)

---

## 开发文档导引

### 系统架构
了解 TodoHeap 的整体设计与技术栈

- [**架构与技术栈**](./02.architecture.md) - 系统架构、技术选型、核心模块、数据库设计

### 需求与规划
理解项目目标与功能需求

- [**项目愿景与方案**](./00.goals.md) - 要解决的问题、目标人群、产品闭环、Agent 架构与当前进度
- [**需求概览（已并入架构）**](./02.architecture.md) - 功能需求摘要（已并入 `架构与技术栈`）

### 开发工作流
参与开发的流程与常见任务

- [**开发流程与任务**](./03.development.md) - 开发流程、常见任务、本地调试

### AI 功能实现
深入理解三大 AI 功能的后端实现

- 详见 [架构与技术栈](./02.architecture.md) 中的 `Edge Functions` 部分（分解/分析/优化 的整体说明）

---

## 按角色快速定位

### 我是 UI / 前端开发者
1. 阅读 [架构与技术栈](./02.architecture.md) 了解整体设计
2. 查看 `frontend/src/components/` 学习组件结构
3. 参考 [开发流程与任务](./03.development.md) 中的"前端开发"部分

### 我是后端 / AI 功能开发者
1. 先读[项目愿景与方案](./00.goals.md)了解产品目标与 Agent 设计，再看 [架构与技术栈](./02.architecture.md) 中的 `Edge Functions` 部分
2. 参考 [开发流程与任务](./03.development.md) 中的"Edge Function 开发"部分
3. 查阅 `supabase/functions/` 代码实现

### 我是数据库 / 系统设计师
1. 阅读 [架构与技术栈](./02.architecture.md) 了解当前设计
2. 查看 `supabase/migrations/` 中的现有迁移
3. 参考 [开发流程与任务](./03.development.md) 中的"数据库修改"部分

### 我想了解完整的系统
1. 先读[项目愿景与方案](./00.goals.md)明确要解决的问题
2. 再读 [架构与技术栈](./02.architecture.md) 获得全景
3. 再读 [开发流程与任务](./03.development.md) 了解动手方式
4. 需要定位代码时看仓库根目录的 `AGENTS.md` 索引

---

## 文档结构

```
docs/zh/dev/
├── index.md              ← 你在这里（导引）
├── 00.goals.md           ← 项目愿景与方案
├── 01.setup.md           ← 环境搭建
├── 02.architecture.md    ← 架构与技术栈
└── 03.development.md     ← 开发流程与常见任务

supabase/functions/       ← Edge Functions 实现
frontend/src/             ← 前端源码（详见仓库根目录 AGENTS.md）
```

---

## 关键概念

### 应用架构三层

| 层 | 技术 | 职责 |
|----|------|------|
| **前端** | Vue 3 + Vite | UI 交互、本地状态、离线支持 |
| **后端计算** | Supabase Edge Functions (Deno) | AI 调用、数据处理、业务逻辑 |
| **数据存储** | Supabase PostgreSQL | 数据持久化、RLS 安全 |

### 核心功能模块

1. **任务管理** - 基础的增删改查与多父层级管理
2. **对话 Agent** - 通过工具读写任务与日程，内置拆解与全局优化指令
3. **优先级计算** - 多维度的自动排序打分
4. **多视图渲染** - 列表、树/图、堆、日程等展示形态
5. **实时同步** - 云端同步与离线编辑

产品要走向的完整闭环（排程求解、校验、日历写入）见[项目愿景与方案](./00.goals.md)。

### 技术栈速查

| 组件 | 技术 | 版本 |
|-----|------|-----|
| 前端框架 | Vue 3 | 3.3+ |
| 构建工具 | Vite | 7.2+ |
| 状态管理 | Pinia | 3.0+ |
| 样式框架 | TailwindCSS | 4.1+ |
| 数据库 | PostgreSQL | 15+ |
| Edge Runtime | Deno | 最新 |

---

## 文档导航

- 新手上路？→ [环境搭建](./01.setup.md)
- 想知道怎么做？→ [开发流程与任务](./03.development.md)
- 需要理解设计？→ [架构与技术栈](./02.architecture.md)
- 想深入 AI 功能？→ [架构与技术栈](./02.architecture.md) 的 Edge Functions 部分

---

## 常见快速问题

**Q: 如何启动开发服务器？**  
A: `cd frontend && pnpm dev`，访问 `http://localhost:5200`

**Q: 如何测试 Edge Function？**  
A: `supabase functions serve` 然后调用本地端点

**Q: 如何修改数据库？**  
A: `supabase migration new migration_name`，编写 SQL，`supabase db push`

**Q: 更多问题？**  
A: 查看 [开发流程与任务](./03.development.md) 或其他详细文档






