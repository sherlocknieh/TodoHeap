import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";

type TodoRow = {
  id: number;
  user_id: string;
  child_ids: number[] | null;
  title: string;
  details: string | null;
  deadline: string | null;
  difficulty: number | null;
  completed_at: string | null;
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

type UpdateTaskScheduleInput = {
  task_id: number;
  deadline?: string | null;
  reason?: string;
};

type BreakdownTaskInput = {
  parent_task_id: number;
  children: Array<{
    title: string;
    details?: string | null;
    deadline?: string | null;
    sort_order?: number;
    difficulty?: number | null;
  }>;
};

type AggregateTasksInput = {
  target_parent_id: number;
  task_ids: number[];
  reason?: string;
};

type RecommendationTaskInput = {
  title: string;
  details: string;
  deadline?: string | null;
  sort_order?: number;
  difficulty?: number | null;
  parent_id?: number | null;
};

const optimizationSystemPrompt = `你是一个专业的任务优化操作员。
你的职责是通过调用工具对现有的任务树进行全面优化。

- 调整合适任务的截止日期（deadline）。
- 为每个任务提供合理的难度评估（difficulty，单位工时）。
- 父任务的工时应当为直接子任务工时的总和。
- 将紧密相关的任务合并到同一个父任务下。
- 最后额外创建一个根任务，标题为"优化总结"，在详情中详述你做了哪些优化。

硬性规则：
- 仅使用提供的工具调用来进行操作。
- 除非绝对必要，否则不要修改已完成的任务。
- 保持更改实用且最少化。
`;

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

async function fetchActiveTodos(supabase: SupabaseClient, userId: string): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("id, user_id, child_ids, title, details, deadline, difficulty, completed_at, created_at, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`fetch todos failed: ${error.message}`);
  }

  return (data || []) as TodoRow[];
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

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: "缺少 DEEPSEEK_API_KEY",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deepseekFetch: typeof globalThis.fetch = (input, init) => {
      const body = init?.body;
      if (typeof body === "string") {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          const nextBody = JSON.stringify({
            ...parsed,
            thinking: { type: "disabled" },
          });
          return globalThis.fetch(input as never, ({ ...init, body: nextBody } as never));
        } catch {
          return globalThis.fetch(input as never, init as never);
        }
      }

      return globalThis.fetch(input as never, init as never);
    };

    const openai = createOpenAI({
      apiKey,
      baseURL: Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
      fetch: deepseekFetch,
    });

    const modelName = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-flash";

    if (modelName.includes("reasoner")) {
      console.warn(`Warning: Model "${modelName}" supports thinking mode which may cause issues. Consider using "deepseek-v4-flash" instead.`);
    }

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
          description: "调整任务的截止日期",
          parameters: z.object({
            task_id: z.number().int(),
            deadline: z.string().nullable().optional(),
            reason: z.string().max(300).optional(),
          }),
          execute: async (input: UpdateTaskScheduleInput) => {
            const { data: existed, error: findError } = await supabase
              .from("todos")
              .select("id")
              .eq("id", input.task_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .maybeSingle();

            if (findError || !existed) {
              return { ok: false, error: "task not found" };
            }

            const patch = {
              deadline: sanitizeIsoDatetime(input.deadline),
            };

            const { data, error } = await supabase
              .from("todos")
              .update(patch)
              .eq("id", input.task_id)
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .select("id, deadline")
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
              details: z.string().max(500).nullable().optional(),
              deadline: z.string().nullable().optional(),
              sort_order: z.number().optional(),
              difficulty: z.number().nullable().optional(),
            })).min(1).max(10),
          }),
          execute: async (input: BreakdownTaskInput) => {
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

            // 逐个创建并挂到父节点的子列表下, 单个函数完成建与挂
            const createdChildIds: number[] = [];
            for (const child of input.children) {
              const { data, error } = await supabase
                .rpc("create_todo", {
                  p_title: child.title.trim().slice(0, 200),
                  p_details: child.details?.trim() || null,
                  p_deadline: sanitizeIsoDatetime(child.deadline),
                  p_sort_order: typeof child.sort_order === "number" ? child.sort_order : null,
                  p_difficulty: typeof child.difficulty === "number" ? child.difficulty : null,
                  p_completed_at: null,
                  p_parent_id: input.parent_task_id,
                });

              if (error) {
                return { ok: false, error: error.message };
              }

              if (data && typeof data.id === "number") {
                createdChildIds.push(data.id);
              }
            }

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
          execute: async (input: AggregateTasksInput) => {
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
              .select("id")
              .eq("user_id", user.id)
              .is("deleted_at", null)
              .in("id", input.task_ids);

            if (tasksError) {
              return { ok: false, error: tasksError.message };
            }

            const movableIds = (tasks || []).map((t: { id: number }) => t.id);
            if (movableIds.length === 0) {
              return { ok: false, error: "no movable tasks" };
            }

            // 先从所有父节点摘除, 再挂到目标父节点; 允许形成环
            const { error: detachError } = await supabase
              .rpc("detach_todo_children", { p_child_ids: movableIds });

            if (detachError) {
              return { ok: false, error: detachError.message };
            }

            const { error: attachError } = await supabase
              .rpc("append_todo_children", {
                p_parent_id: input.target_parent_id,
                p_child_ids: movableIds,
              });

            if (attachError) {
              return { ok: false, error: attachError.message };
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
            details: z.string().min(10).max(1200),
            deadline: z.string().nullable().optional(),
            sort_order: z.number().optional(),
            difficulty: z.number().nullable().optional(),
            parent_id: z.number().int().nullable().optional(),
          }),
          execute: async (input: RecommendationTaskInput) => {
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

            const { data, error } = await supabase
              .rpc("create_todo", {
                p_title: input.title.trim().slice(0, 200),
                p_details: input.details.trim().slice(0, 1200),
                p_deadline: sanitizeIsoDatetime(input.deadline),
                p_sort_order: typeof input.sort_order === "number" ? input.sort_order : null,
                p_difficulty: typeof input.difficulty === "number" ? input.difficulty : null,
                p_completed_at: null,
                p_parent_id: parentId,
              });

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

    // 构建响应对象，完整处理 reasoning_content
    const buildResponse = (data: Record<string, unknown>) => {
      const response: Record<string, unknown> = { ...data };
      // 如果有 reasoning_content，添加到响应中（处理 thinking 模式）
      if (result.reasoning) {
        response.reasoning_content = result.reasoning;
      }
      return response;
    };

    if (!didOptimize) {
      const errorBody = buildResponse({
        success: false,
        error: "未执行任何优化动作",
        summary: result.text,
      });
      return new Response(JSON.stringify(errorBody), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const successBody = buildResponse({
      success: true,
      summary: result.text,
      changes,
    });
    return new Response(JSON.stringify(successBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("optimize_tasks error:", error);
    const message = error instanceof Error ? error.message : String(error);
    
    // 处理 thinking_mode 相关的错误
    if (message.includes("reasoning_content") || message.includes("thinking mode")) {
      return new Response(JSON.stringify({
        success: false,
        error: "模型不支持当前配置，请检查环境变量设置",
        message: message
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
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
