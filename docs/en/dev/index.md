# Developer Guide

How to run, understand and extend TodoHeap.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vue 3 + Vite 7 + Pinia + Tailwind CSS 4 |
| Data / auth / realtime | Supabase (PostgreSQL, Auth, Realtime) |
| AI compute | Supabase Edge Functions (Deno) calling an LLM |
| Docs | VitePress |

The repository contains three independently installed sub-projects: `frontend/`, `docs/` and `supabase/`.

## Setup

```bash
git clone https://github.com/sherlocknieh/TodoHeap.git
cd TodoHeap/frontend
pnpm install
pnpm dev
```

The app runs on `http://localhost:5200` (the docs dev server uses 5201).

Create `frontend/.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUB_KEY=your_publishable_key
```

To work against a local Supabase stack (requires the Supabase CLI and Docker):

```bash
supabase start          # local API on :54321, Studio on :54323
supabase db reset       # re-apply every migration
```

### Deployment variables

The GitHub Pages build reads the frontend config from repository variables, never from `.env.local`.
A missing `VITE_SUPABASE_PUB_KEY` ships a bundle whose key is empty and fails on load with
`supabaseKey is required`, so the workflow validates both variables before building.

Set them under `Settings → Secrets and variables → Actions → Variables`:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://<project>.supabase.co` |
| `VITE_SUPABASE_PUB_KEY` | The project's publishable key |

## Repository layout

```text
frontend/src/
├── pages/            # routes; pages/todo/* are the in-workspace views
├── components/       # UI pieces, AppIcon holds the whole icon set
├── stores/           # Pinia; todos.* are pluggable slices
├── lib/              # Supabase client, user settings
├── utils/            # pure helpers (priority scoring, panel context)
└── style.css         # Tailwind entry + design tokens

supabase/
├── migrations/       # source of truth for the schema, append only
└── functions/        # breakdown_task, new_task_ai, llm_gateway
```

## Goals

[Vision and Approach](./00.goals.md) explains the problem, the target audience, the task-to-schedule loop and the Planner–Executor–Reviewer design, and maps the plan against what is implemented today.

## Architecture

### Frontend shell

`pages/Todo.vue` is the workspace shell (activity bar, sidebar, content column, detail panel, status bar). Child routes render into its `<router-view>`; views only own their own content.

### State

`stores/todos.js` is the façade; behaviour is composed from slices:

| Slice | Responsibility |
| --- | --- |
| `todos.optimistic.js` | Optimistic updates and cascades |
| `todos.rollback.js` | Revert local changes when a write fails |
| `todos.realtime.js` | Supabase Realtime subscription and reconnection |
| `todos.breakdown.js` | Calls the three AI edge functions |
| `syncQueue.js` | Offline queue in localforage, temp-id replacement, replay |

Write path: UI → store action → optimistic update + enqueue → Supabase → `sync:id-replaced` on success, rollback on failure.

### Edge functions

| Function | Purpose |
| --- | --- |
| `breakdown_task` | Split a task into 3–6 subtasks, returns JSON |
| `new_task_ai` | Natural language → new task tree |
| `llm_gateway` | Built-in model proxy; validates the user JWT and forwards to the platform model |

Secrets stay in Supabase secrets and GitHub Actions; the frontend only ever holds the publishable key.

## Common tasks

```bash
cd frontend && pnpm test          # store-level unit tests (vitest)
cd frontend && pnpm build         # output goes to repository-root dist/
cd docs && pnpm dev               # documentation site on :5201
```

- **Change the schema**: add a new file under `supabase/migrations/` with a timestamp prefix, then `supabase db push`. Never edit an existing migration.
- **Update the UI**: colours come from `neutral-*` plus the `accent-*` scale in `style.css`; use `AppIcon` instead of emoji; prefer `rounded-md` and hairline borders over shadows and gradients.
- **Deployment**: pushing to `main` with changes under `docs/` or `frontend/` triggers `.github/workflows/deploy.yaml`, which builds both and publishes to GitHub Pages under `/TodoHeap/`.

## Known issues

`pnpm type-check` currently fails with an internal `vue-tsc` error (vue-tsc 1.8 with TypeScript 5.9). It is an environment issue, not a type error in the code.
