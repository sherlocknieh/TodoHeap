import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";

type TodoStatus = "todo" | "doing" | "done";

type TodoRow = {
  id: number;
  user_id: string;
  parent_id: number | null;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: number | null;
  deadline: string | null;
  start_date: string | null;
  difficulty: number | null;
  created_at: string;
  updated_at: string;
};

type RequestBody = {
  query?: string;
};

type OptimizeChanges = {
  dateAdjusted: number[];
  breakdowns: Array<{ parentId: number; createdChildIds: number[] }>;
  aggregations: Array<{ targetParentId: number; movedTaskIds: number[] }>;
  recommendationTaskId: number | null;
};

const optimizationSystemPrompt = `You are an AI task optimization operator.
You must optimize an existing todo tree by calling tools.

Required action categories:
1) Adjust dates (deadline/start_date) for suitable tasks.
2) Break down at least one large task into child tasks.
3) Aggregate related tasks under one parent.
4) Create exactly one recommendation task with detailed execution advice.

Hard rules:
- Operate only with provided tool calls.
- Keep statuses in todo/doing/done.
- Priority must be 0-4.
- Do not modify completed tasks unless absolutely necessary.
- Keep changes practical and minimal.
- Provide a concise Chinese summary after tools finish.`;

function createSupabaseClient(req: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
}

function sanitizeIsoDatetime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
}

function sanitizePriority(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 4) return 4;
  return Math.round(n);
}

function sanitizeStatus(value: unknown): TodoStatus {
  return value === "doing" || value === "done" ? value : "todo";
}

async function fetchActiveTodos(supabase: SupabaseClient, userId: string): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("id, user_id, parent_id, title, description, status, priority, deadline, start_date, difficulty, created_at, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`fetch todos failed: ${error.message}`);
  }

  return (data || []) as TodoRow[];
}

function buildParentMap(todos: TodoRow[]): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const t of todos) {
    map.set(t.id, t.parent_id ?? null);
  }
  return map;
}

function createsCycle(parentMap: Map<number, number | null>, movingTaskId: number, targetParentId: number): boolean {
  if (movingTaskId === targetParentId) return true;

  const visited = new Set<number>();
  let cursor: number | null = targetParentId;

  while (cursor != null) {
    if (cursor === movingTaskId) return true;
    if (visited.has(cursor)) break;
    visited.add(cursor);
    cursor = parentMap.get(cursor) ?? null;
  }

  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const userPrompt = typeof body.query === "string" && body.query.trim()
      ? body.query.trim()
      : "请对当前任务进行一次全局优化。";

    const supabase = createSupabaseClient(req);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const todos = await fetchActiveTodos(supabase, user.id);
    if (todos.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "当前没有可优化的任务",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changes: OptimizeChanges = {
      dateAdjusted: [],
      breakdowns: [],
      aggregations: [],
      recommendationTaskId: null,
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY2") || "";
    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: "缺少 OPENAI_API_KEY/OPENAI_API_KEY2",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openai = createOpenAI({
      apiKey,
      baseURL: Deno.env.get("OPENAI_BASE_URL") || undefined,
    });

    const modelName = Deno.env.get("OPENAI_MODEL") || "deepseek-chat";

    const result = await generateText({
      model: openai(modelName),
      maxSteps: 12,
      system: optimizationSystemPrompt,
      prompt: [
        `当前用户ID: ${user.id}`,
        `当前任务总数: ${todos.length}`,
        `任务数据(JSON): ${JSON.stringify(todos)}`,
        `用户要求: ${userPrompt}`,
      ].join("\n\n"),
      tools: {
        update_task_schedule: tool({
          description: "调整任务的 deadline/start_date",
          parameters: z.object({
            task_id: z.number().int(),
            deadline: z.string().nullable().optional(),
            start_date: z.string().nullable().optional(),
            reason: z.string().max(300).optional(),
          }),
          execute: async (input) => {
            const { data: existed, error: findError } = await supabase
              .from("todos")
              .select("id, status")
              .eq("id", input.task_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (findError || !existed) {
              return { ok: false, error: "task not found" };
            }

            const patch = {
              deadline: sanitizeIsoDatetime(input.deadline),
              start_date: sanitizeIsoDatetime(input.start_date),
            };

            const { data, error } = await supabase
              .from("todos")
              .update(patch)
              .eq("id", input.task_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .select("id, deadline, start_date")
              .single();

            if (error) {
              return { ok: false, error: error.message };
            }

            if (!changes.dateAdjusted.includes(input.task_id)) {
              changes.dateAdjusted.push(input.task_id);
            }

            return { ok: true, data };
          },
        }),

        breakdown_task: tool({
          description: "将父任务拆解成多个子任务",
          parameters: z.object({
            parent_task_id: z.number().int(),
            children: z.array(z.object({
              title: z.string().min(1).max(200),
              description: z.string().max(500).nullable().optional(),
              deadline: z.string().nullable().optional(),
              start_date: z.string().nullable().optional(),
              priority: z.number().int().min(0).max(4).optional(),
              status: z.enum(["todo", "doing", "done"]).optional(),
            })).min(1).max(10),
          }),
          execute: async (input) => {
            const { data: parent, error: parentError } = await supabase
              .from("todos")
              .select("id")
              .eq("id", input.parent_task_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (parentError || !parent) {
              return { ok: false, error: "parent task not found" };
            }

            const rows = input.children.map((child) => ({
              user_id: user.id,
              parent_id: input.parent_task_id,
              title: child.title.trim().slice(0, 200),
              description: child.description?.trim() || null,
              deadline: sanitizeIsoDatetime(child.deadline),
              start_date: sanitizeIsoDatetime(child.start_date),
              priority: sanitizePriority(child.priority),
              status: sanitizeStatus(child.status),
            }));

            const { data, error } = await supabase
              .from("todos")
              .insert(rows)
              .select("id");

            if (error) {
              return { ok: false, error: error.message };
            }

            const createdChildIds = (data || []).map((x: { id: number }) => x.id);
            changes.breakdowns.push({
              parentId: input.parent_task_id,
              createdChildIds,
            });

            return { ok: true, parentId: input.parent_task_id, createdChildIds };
          },
        }),

        aggregate_tasks_under_parent: tool({
          description: "把多个任务收拢到同一父任务下",
          parameters: z.object({
            target_parent_id: z.number().int(),
            task_ids: z.array(z.number().int()).min(1).max(30),
            reason: z.string().max(300).optional(),
          }),
          execute: async (input) => {
            const { data: parent, error: parentError } = await supabase
              .from("todos")
              .select("id")
              .eq("id", input.target_parent_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (parentError || !parent) {
              return { ok: false, error: "target parent not found" };
            }

            const { data: tasks, error: tasksError } = await supabase
              .from("todos")
              .select("id, parent_id")
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .in("id", input.task_ids);

            if (tasksError) {
              return { ok: false, error: tasksError.message };
            }

            const allTodos = await fetchActiveTodos(supabase, user.id);
            const parentMap = buildParentMap(allTodos);

            const movable = (tasks || []).filter((t: { id: number; parent_id: number | null }) => {
              return !createsCycle(parentMap, t.id, input.target_parent_id);
            });

            const movableIds = movable.map((t: { id: number }) => t.id);
            if (movableIds.length === 0) {
              return { ok: false, error: "no movable tasks after cycle check" };
            }

            const { error: updateError } = await supabase
              .from("todos")
              .update({ parent_id: input.target_parent_id })
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .in("id", movableIds);

            if (updateError) {
              return { ok: false, error: updateError.message };
            }

            changes.aggregations.push({
              targetParentId: input.target_parent_id,
              movedTaskIds: movableIds,
            });

            return { ok: true, targetParentId: input.target_parent_id, movedTaskIds: movableIds };
          },
        }),

        create_recommendation_task: tool({
          description: "创建一条建议型任务（需详述执行建议）",
          parameters: z.object({
            title: z.string().min(1).max(200),
            description: z.string().min(10).max(1200),
            deadline: z.string().nullable().optional(),
            start_date: z.string().nullable().optional(),
            priority: z.number().int().min(0).max(4).optional(),
            parent_id: z.number().int().nullable().optional(),
          }),
          execute: async (input) => {
            const parentId = input.parent_id ?? null;
            if (parentId != null) {
              const { data: parent, error: parentError } = await supabase
                .from("todos")
                .select("id")
                .eq("id", parentId)
                .eq("user_id", user.id)
                .is("deleted_at", null)
                .maybeSingle();

              if (parentError || !parent) {
                return { ok: false, error: "parent task not found" };
              }
            }

            const payload = {
              user_id: user.id,
              title: input.title.trim().slice(0, 200),
              description: input.description.trim().slice(0, 1200),
              deadline: sanitizeIsoDatetime(input.deadline),
              start_date: sanitizeIsoDatetime(input.start_date),
              priority: sanitizePriority(input.priority),
              status: "todo" as const,
              parent_id: parentId,
            };

            const { data, error } = await supabase
              .from("todos")
              .insert(payload)
              .select("id, title, description")
              .single();

            if (error) {
              return { ok: false, error: error.message };
            }

            changes.recommendationTaskId = data.id;
            return { ok: true, task: data };
          },
        }),
      },
    });

    const didOptimize =
      changes.dateAdjusted.length > 0 ||
      changes.breakdowns.length > 0 ||
      changes.aggregations.length > 0 ||
      changes.recommendationTaskId != null;

    if (!didOptimize) {
      return new Response(JSON.stringify({
        success: false,
        error: "未执行任何优化动作",
        summary: result.text,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      summary: result.text,
      changes,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("optimize_tasks error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      success: false,
      error: message,
      message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
