import OpenAI from "openai";
import { corsWrapper } from "../_shared/cors.ts";

const number = 3;
const systemPrompt = `You are an AI assistant helping with task breakdown. 
Generate exactly ${number} an appropriate number of child tasks based on the provided Goal task and context.

IMPORTANT: Your response MUST be a JSON object with a "children" property containing an array of child task objects. 
Each child task must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- status: A status label (todo, doing, done, deleted)
- priority: A priority label interger(0 for low, 1 for medium, 2 for high)
- deadline: An optional deadline in ISO 8601 format or null if no deadline is set.

You may optionally include a "metadata" object. Do not include any other top-level properties.
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



async function callOpenAI(messages: OpenAIMessage[] = []): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const baseUrl = Deno.env.get("OPENAI_BASE_URL");
  const model = Deno.env.get("OPENAI_MODEL") || "deepseek-chat";

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
    });
    const reply = response.choices[0].message.content;
    if (!reply) {
      throw new Error("No reply from OpenAI");
    }
    return reply;

  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return "Error calling OpenAI";
  }
}

async function handler(req: Request) {
  try {
    const body: RequestBody = await req.json();
    
    // 验证请求体
    if (!body) {
      return new Response(JSON.stringify({ error: "Request body is empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (!body.todosTree || (Array.isArray(body.todosTree) && body.todosTree.length === 0)) {
      return new Response(JSON.stringify({ error: "todosTree is required and cannot be empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (!body.query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
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
    ]
    
    // 调用 OpenAI API
    const aiResponse = await callOpenAI(messages);
    
    // 尝试解析 AI 响应为 JSON
    try {
      const cleanedResponse = cleanText(aiResponse);
      const parsedResponse = JSON.parse(cleanedResponse);
      
      // 确保返回的数据格式一致
      const response = parsedResponse.children ? parsedResponse : { children: parsedResponse };
      
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (parseError) {
      // 如果解析失败，返回默认格式的响应
      return new Response(JSON.stringify({
        children: [{
          title: "AI Response",
          status: Status.todo,
          priority: Priority.medium
        }]
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
  } catch (error) {
    console.error("Handler error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function test_handler(req: Request) {
  try {
    const body: RequestBody = await req.json();
    const dumpedTree  = dumpTree(body.todosTree);
    const response = {'dumpedTree': dumpedTree}
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Test handler error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: "Test handler error",
      message: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}


Deno.serve(corsWrapper(handler));
