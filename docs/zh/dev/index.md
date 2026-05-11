---
layout: doc
title: 开发指南
outline: deep
---

# 开发指南

欢迎加入 TodoHeap 的开发！本指南帮助你快速上手项目，理解体系，并参与功能开发。

## 🚀 快速开始

### 项目地址
https://github.com/sherlocknieh/TodoHeap

### 前置要求
- Node.js 18+
- pnpm 8+
- Git

### 一键启动

```bash
git clone https://github.com/sherlocknieh/TodoHeap.git
cd TodoHeap
pnpm install
cd frontend
pnpm dev
```

详见 [环境搭建](./01.setup.md)

---

## 📚 开发文档导引

### 🏗️ 系统架构
了解 TodoHeap 的整体设计与技术栈

- [**架构与技术栈**](./02.architecture.md) - 系统架构、技术选型、核心模块、数据库设计

### 📋 需求与规划
理解项目目标与功能需求

- [**需求概览（已并入架构）**](./02.architecture.md) - 功能需求摘要（已并入 `架构与技术栈`）

### 💻 开发工作流
参与开发的流程与常见任务

- [**开发流程与任务**](./03.development.md) - 开发流程、常见任务、本地调试

### 🤖 AI 功能实现
深入理解三大 AI 功能的后端实现

- 详见 [架构与技术栈](./02.architecture.md) 中的 `Edge Functions` 部分（分解/分析/优化 的整体说明）

---

## 🎯 按角色快速定位

### 我是 UI / 前端开发者
1. 阅读 [架构与技术栈](./02.architecture.md) 了解整体设计
2. 查看 `frontend/src/components/` 学习组件结构
3. 参考 [开发流程与任务](./03.development.md) 中的"前端开发"部分

### 我是后端 / AI 功能开发者
1. 阅读 [架构与技术栈](./02.architecture.md) 中的需求概览与 `Edge Functions` 部分了解功能目标
2. 参考 [开发流程与任务](./03.development.md) 中的"Edge Function 开发"部分
3. 查阅 `supabase/functions/` 代码实现

### 我是数据库 / 系统设计师
1. 阅读 [架构与技术栈](./02.architecture.md) 了解当前设计
2. 查看 `supabase/migrations/` 中的现有迁移
3. 参考 [开发流程与任务](./03.development.md) 中的"数据库修改"部分

### 我想了解完整的系统
1. 先读 [架构与技术栈](./02.architecture.md) 获得全景
2. 再读 [需求文档](./02.architecture.md 理解功能
3. 然后根据兴趣深入阅读具体模块文档

---

## 📂 文档结构

```
docs/zh/dev/
├── index.md                          ← 你在这里（导引）
├── setup.md                          ← 环境搭建
├── architecture.md                   ← 架构与技术栈（含需求概览）
├── development.md                    ← 开发流程与任务（含 AI 概要）
└── supabase/functions/               ← Edge Functions 实现
```

---

## 🔑 关键概念

### 应用架构三层

| 层 | 技术 | 职责 |
|----|------|------|
| **前端** | Vue 3 + Vite | UI 交互、本地状态、离线支持 |
| **后端计算** | Supabase Edge Functions (Deno) | AI 调用、数据处理、业务逻辑 |
| **数据存储** | Supabase PostgreSQL | 数据持久化、RLS 安全 |

### 核心功能模块

1. **任务管理** - 基础的增删改查与层级管理
2. **AI 任务分解** - 调用大模型分解复杂任务
3. **AI 任务分析** - 模糊描述自动分析与入库
4. **优先级计算** - 多维度智能排序
5. **多视图渲染** - 列表、树、思维导图、堆四种展示
6. **实时同步** - 云端同步与离线编辑

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

## 📖 文档导航

- 新手上路？→ [环境搭建](./01.setup.md)
- 想知道怎么做？→ [开发流程与任务](./03.development.md)
- 需要理解设计？→ [架构与技术栈](./02.architecture.md)
- 想深入某功能？→ 选择对应的 AI 功能文档

---

## ⚡ 常见快速问题

**Q: 如何启动开发服务器？**  
A: `cd frontend && pnpm dev`，访问 http://localhost:5173

**Q: 如何测试 Edge Function？**  
A: `supabase functions serve` 然后调用本地端点

**Q: 如何修改数据库？**  
A: `supabase migration new migration_name`，编写 SQL，`supabase db push`

**Q: 更多问题？**  
A: 查看 [开发流程与任务](./03.development.md) 或其他详细文档






