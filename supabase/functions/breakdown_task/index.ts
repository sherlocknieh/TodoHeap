import OpenAI from "openai";
import { corsHeaders } from "../_shared/cors.ts";

const systemPrompt = `You are an AI assistant helping with task breakdown.
Generate an appropriate number of child tasks based on the provided Goal task and context.
The number of child tasks should be reasonable and practical - typically between 2-6 tasks depending on the complexity and scope of the goal task.

IMPORTANT: Your response MUST be a valid JSON array of child task objects (not wrapped in any object).
Each child task must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- status: A status label (todo, doing, done, deleted)
- priority: A priority label integer (0 for low, 1 for medium, 2 for high)
- deadline: An optional deadline in ISO 8601 format or null if no deadline is set.

Example response format:
[
  {"title": "Task 1", "status": "todo", "priority": 1, "deadline": null},
  {"title": "Task 2", "status": "todo", "priority": 2, "deadline": "2024-12-31T00:00:00Z"}
]

Output ONLY the JSON array, no markdown, no explanation.
`;

enum Status {
  todo = "todo",
  doing = "doing",
  done = "done",
  deleted = "deleted",
}
enum Priority {
  low = 0,
  medium = 1,
  high = 2,
}
interface treeNode {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  deadline?: string | null;
  children?: treeNode[];
}

interface RequestBody {
  todosTree: treeNode | treeNode[];
  selectedNodeId: number;
  query: string;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function cleanText(text: string): string {
  // Clean AI response
  let cleaned = text.replace(/```json\n/g, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/\n/g, "");
  return cleaned;
}

function dumpTree(tree: treeNode | treeNode[] | null | undefined): string {
  if (!tree) {
    return "Empty tree";
  }
  
  let result = "任务树结构:\n";
  const dumpNode = (node: treeNode | null | undefined, level: number) => {
    if (!node) {
      return;
    }
    
    const indent = "  ".repeat(level);
    const priorityText = node.priority === 2 ? "高" : node.priority === 1 ? "中" : "低";
    const statusText = node.status === "todo" ? "待办" :
                      node.status === "doing" ? "进行中" :
                      node.status === "done" ? "已完成" : "已删除";
    
    result += `${indent}📋 任务: ${node.title}\n`;
    result += `${indent}   ID: ${node.id}\n`;
    result += `${indent}   状态: ${statusText}\n`;
    result += `${indent}   优先级: ${priorityText}\n`;
    result += `${indent}   截止日期: ${node.deadline || "无"}\n`;
    
    if (node.children && node.children.length > 0) {
      result += `${indent}   子任务:\n`;
      for (const child of node.children) {
        dumpNode(child, level + 2);
      }
    }
    result += "\n";
  };
  
  // 如果是数组，处理每个根节点
  if (Array.isArray(tree)) {
    result += `根任务数量: ${tree.length}\n\n`;
    tree.forEach((node, index) => {
      result += `根任务 ${index + 1}:\n`;
      dumpNode(node, 1);
    });
  } else {
    dumpNode(tree, 0);
  }
  
  return result;
}

function getGoalTask(tree: treeNode | treeNode[] | null | undefined, selectedNodeId: number): treeNode[] {
  // task that has id === selectedNodeId
  if (!tree) {
    return [];
  }
  
  const goalTasks: treeNode[] = [];

  const traverse = (node: treeNode | null | undefined) => {
    if (!node) {
      return;
    }
    
    if (node.id === selectedNodeId) {
      goalTasks.push(node);
    }
    
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  
  // 处理树可能是单个节点或节点数组的情况
  if (Array.isArray(tree)) {
    for (const node of tree) {
      traverse(node);
    }
  } else {
    traverse(tree);
  }
  
  return goalTasks;
}



// 创建 OpenAI 客户端
function createOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const baseUrl = Deno.env.get("OPENAI_BASE_URL");

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });
}

// 流式响应处理器
async function handler(req: Request) {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    
    // 验证请求体
    if (!body) {
      return new Response(JSON.stringify({ error: "Request body is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    if (!body.todosTree || (Array.isArray(body.todosTree) && body.todosTree.length === 0)) {
      return new Response(JSON.stringify({ error: "todosTree is required and cannot be empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    if (!body.query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    const dumpedTree = dumpTree(body.todosTree);
    const goalTask = getGoalTask(body.todosTree, body.selectedNodeId);
    const dumpedGoalTask = dumpTree(goalTask);

    // 构建完整的提示词，包含任务树和用户查询
    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `Current task tree:\n${dumpedTree}` },
      { role: "system", content: `Goal task:\n${dumpedGoalTask}` },
      { role: "user", content: body.query }
    ];

    const openai = createOpenAIClient();
    const model = Deno.env.get("OPENAI_MODEL") || "deepseek-chat";

    // 创建流式响应
    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      stream: true,
    });

    // 创建一个 TransformStream 来处理流式数据
    const encoder = new TextEncoder();
    
    let fullContent = "";
    let lastParsedIndex = 0;
    let taskCount = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullContent += content;

            // 尝试解析已完成的 JSON 对象
            // 查找完整的 JSON 对象 {...}
            const parsed = tryParseIncrementalTasks(fullContent, lastParsedIndex);
            
            for (const task of parsed.tasks) {
              taskCount++;
              // 发送 SSE 格式的数据
              const sseData = `data: ${JSON.stringify({ type: "task", data: task, index: taskCount })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
            
            lastParsedIndex = parsed.newIndex;
          }

          // 发送完成信号
          const doneData = `data: ${JSON.stringify({ type: "done", totalCount: taskCount })}\n\n`;
          controller.enqueue(encoder.encode(doneData));
          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          const errorData = `data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });
    
  } catch (error) {
    console.error("Handler error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// 尝试增量解析 JSON 数组中的任务对象
interface ParsedResult {
  tasks: Array<{
    title: string;
    status: string;
    priority: number;
    deadline: string | null;
  }>;
  newIndex: number;
}

function tryParseIncrementalTasks(content: string, startIndex: number): ParsedResult {
  const tasks: ParsedResult["tasks"] = [];
  let currentIndex = startIndex;
  
  // 清理内容：移除 markdown 代码块标记
  let cleanContent = content;
  if (cleanContent.includes("```json")) {
    cleanContent = cleanContent.replace(/```json\n?/g, "");
  }
  if (cleanContent.includes("```")) {
    cleanContent = cleanContent.replace(/```\n?/g, "");
  }
  
  // 查找数组开始位置
  const arrayStart = cleanContent.indexOf("[");
  if (arrayStart === -1 || currentIndex < arrayStart) {
    currentIndex = arrayStart !== -1 ? arrayStart + 1 : currentIndex;
  }
  
  // 从当前位置开始查找完整的 JSON 对象
  let braceCount = 0;
  let objectStart = -1;
  
  for (let i = currentIndex; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    
    if (char === "{") {
      if (braceCount === 0) {
        objectStart = i;
      }
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0 && objectStart !== -1) {
        // 找到一个完整的对象
        const objectStr = cleanContent.substring(objectStart, i + 1);
        try {
          const task = JSON.parse(objectStr);
          // 验证必需字段
          if (task.title && typeof task.title === "string") {
            tasks.push({
              title: task.title,
              status: task.status || "todo",
              priority: typeof task.priority === "number" ? task.priority : 1,
              deadline: task.deadline || null
            });
            currentIndex = i + 1;
          }
        } catch {
          // JSON 解析失败，可能是不完整的对象，继续
        }
        objectStart = -1;
      }
    }
  }
  
  return { tasks, newIndex: currentIndex };
}

Deno.serve(handler);
