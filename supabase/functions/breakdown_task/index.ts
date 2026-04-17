import OpenAI from "openai";
import { corsHeaders } from "../_shared/cors.ts";

// 系统提示词：定义 AI 助手的角色和输出格式
// 要求 AI 将选定的目标任务拆解为合理的子任务列表（3-10个）
// 强制输出格式为纯 JSON 数组，包含 title, description 和 deadline 字段
const systemPrompt = `You are an AI assistant helping with task breakdown.
Generate an appropriate number of child tasks based on the provided Goal task and context.
The number of child tasks should be reasonable and practical - typically between 3-10 tasks depending on the complexity and scope of the goal task.

IMPORTANT: Your response MUST be a valid JSON array of child task objects (not wrapped in any object).
Each child task must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- description: A brief description (optional, 0-500 characters)
- sort_order: The order of the task in the list, starting from 1 for the first task.
- deadline: An optional deadline in ISO 8601 format or null if no deadline is set.

Example response format:
[
  {"title": "1.Task 1", "description": "This is the first child task", "sort_order": 1, "deadline": "2024-12-31T23:59:59Z"},
  {"title": "2.Task 2", "description": "This is the second child task", "sort_order": 2, "deadline": "2025-01-31T23:59:59Z"},
  {"title": "3.Task 3", "description": "This is the third child task", "sort_order": 3, "deadline": null}
]

Output ONLY the JSON array, no markdown, no explanation.
`;

// 任务状态枚举
enum Status {
  todo = "todo",     // 待办
  doing = "doing",   // 进行中
  done = "done",     // 已完成
  deleted = "deleted", // 已删除
}

// 任务优先级枚举
enum Priority {
  low = 0,    // 低
  medium = 1, // 中
  high = 2,   // 高
}

// 任务树节点接口
interface treeNode {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  deadline?: string | null;
  children?: treeNode[];
}

// API 请求体接口
interface RequestBody {
  todosTree: treeNode | treeNode[]; // 当前整个任务树（或根节点数组）
  selectedNodeId: number;           // 需要拆解的目标任务 ID
  query: string;                    // 用户输入的额外要求/描述
}

// OpenAI 消息格式接口
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}


// 将任务树结构序列化为易于 AI 理解的文本字符串包含层级缩进、状态、优先级等信息
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
  
  // 处理数组根节点的情况
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

// 在任务树中查找指定 ID 的目标任务返回一个包含该节点的数组（仅供 dumpTree 使用以展示目标上下文）
function getGoalTask(tree: treeNode | treeNode[] | null | undefined, selectedNodeId: number): treeNode[] {
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
  
  if (Array.isArray(tree)) {
    for (const node of tree) {
      traverse(node);
    }
  } else {
    traverse(tree);
  }
  
  return goalTasks;
}

// 根据环境变量初始化 OpenAI 客户端
function createOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get("OPENAI_API_KEY2");
  const baseUrl = Deno.env.get("OPENAI_BASE_URL");

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });
}

// 增量解析 JSON 数组中的任务对象
// 在 AI 还在流式输出内容时，实时寻找已经生成的完整任务对象 {...}
interface ParsedResult {
  tasks: Array<{
    title: string;
    description?: string;
    deadline: string | null;
  }>;
  newIndex: number; // 下一次解析应开始的位置偏移
}

// 尝试解析增量内容中的任务对象
function tryParseIncrementalTasks(content: string, startIndex: number): ParsedResult {
  const tasks: ParsedResult["tasks"] = [];
  let currentIndex = startIndex;
  
  // 1. 清理内容：移除 AI 有时会错误添加的 Markdown 代码块标记包围
  let cleanContent = content;
  if (cleanContent.includes("```json")) {
    cleanContent = cleanContent.replace(/```json\n?/g, "");
  }
  if (cleanContent.includes("```")) {
    cleanContent = cleanContent.replace(/```\n?/g, "");
  }
  
  // 2. 查找数组开始位置（如果是第一次调用且未找到数组开头，则寻找 [）
  const arrayStart = cleanContent.indexOf("[");
  if (arrayStart === -1 || currentIndex < arrayStart) {
    currentIndex = arrayStart !== -1 ? arrayStart + 1 : currentIndex;
  }
  
  // 3. 状态机：从当前位置开始查找完整的 JSON 对象 {...}
  let braceCount = 0;
  let objectStart = -1;
  
  for (let i = currentIndex; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    
    // 发现对象起始
    if (char === "{") {
      if (braceCount === 0) {
        objectStart = i;
      }
      braceCount++;
    } 
    // 发现对象结束
    else if (char === "}") {
      braceCount--;
      
      // 当大括号匹配完成且我们记录了起始位置时，尝试解析该对象
      if (braceCount === 0 && objectStart !== -1) {
        const objectStr = cleanContent.substring(objectStart, i + 1);
        try {
          // 尝试转换为 JSON
          const task = JSON.parse(objectStr);
          // 业务逻辑验证：必须包含 title 字段
          if (task.title && typeof task.title === "string") {
            tasks.push({
              title: task.title,
              description: task.description,
              deadline: task.deadline || null
            });
            // 记录解析进度，下次从此位置之后继续
            currentIndex = i + 1;
          }
        } catch {
          // 如果解析失败（如字符还没传输完），不移动 currentIndex，等下次内容更多时再试
        }
        objectStart = -1;
      }
    }
  }
  
  return { tasks, newIndex: currentIndex };
}

// 边缘函数主处理器
async function handler(req: Request) {
  // 1. 处理 CORS 跨域请求
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    
    // 2. 验证请求体有效性
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
    
    // 3. 准备 AI 上下文
    // 转换整个任务树结构和特定的目标任务
    const dumpedTree = dumpTree(body.todosTree);
    const goalTask = getGoalTask(body.todosTree, body.selectedNodeId);
    const dumpedGoalTask = dumpTree(goalTask);

    // 构建完整的提示词：包含系统指令、任务树上下文、拆解目标及用户补充说明
    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `Current task tree:\n${dumpedTree}` },
      { role: "system", content: `Goal task:\n${dumpedGoalTask}` },
      { role: "user", content: body.query }
    ];

    const openai = createOpenAIClient();
    const model = Deno.env.get("OPENAI_MODEL") || "deepseek-chat";

    // 4. 调用 AI API 并启用流式响应
    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullContent = "";
    let lastParsedIndex = 0;
    let taskCount = 0;

    // 5. 创建 ReadableStream 以 SSE (Server-Sent Events) 格式向前端推送解析出的任务
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullContent += content;

            // 增量解析 fullContent 中新出现的完整 JSON 任务对象
            const parsed = tryParseIncrementalTasks(fullContent, lastParsedIndex);
            
            for (const task of parsed.tasks) {
              taskCount++;
              // 以 data: {json} \n\n 格式发送 SSE 消息
              const sseData = `data: ${JSON.stringify({ type: "task", data: task, index: taskCount })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
            
            // 更新已解析的位置偏移
            lastParsedIndex = parsed.newIndex;
          }

          // 发送所有的任务完成后的结束信号
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

    // 6. 返回 HTTP 流响应
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

// 启动 Deno 服务器监听请求
Deno.serve(handler);