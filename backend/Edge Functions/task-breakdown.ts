// Edge Function: Task Breakdown
// API: https://nxzvisuvwtsnlrugqghx.supabase.co/functions/v1/task-breakdown

/*
POST /functions/v1/task-breakdown
Content-Type: application/json

{
  "goal": "学习线性代数",
  "apiKey": "your-api-key",  // 可选，如果已设置环境变量
  "model": "deepseek-chat",  // 可选
  "baseUrl": "https://api.deepseek.com/v1"  // 可选
}
*/




import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NUMBER = 5;
const SYSTEM_PROMPT = `You are an AI assistant helping with task breakdown. 
Generate exactly ${NUMBER} an appropriate number of subtasks based on the provided prompt and context.

IMPORTANT: Your response MUST be a JSON object with a "subtasks" property containing an array of subtask objects. 
Each subtask must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- description: A detailed description (minimum 10 characters)
- details: Implementation details (minimum 20 characters)

You may optionally include a "metadata" object. Do not include any other top-level properties.
`;

interface RequestPayload {
  goal: string;
  systemPrompt?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

interface SubtaskItem {
  title: string;
  description: string;
  details: string;
  metadata?: Record<string, unknown>;
}

interface ResponseData {
  subtasks?: SubtaskItem[];
  error?: string;
}

function cleanText(text: string): string {
  // Clean AI response
  let cleaned = text.replace(/```json\n/g, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/\n/g, "");
  return cleaned;
}

async function breakdownTask(
  goal: string,
  apiKey: string,
  baseUrl: string = "https://api.deepseek.com/v1",
  model: string = "deepseek-chat",
  systemPrompt: string = SYSTEM_PROMPT
): Promise<ResponseData> {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: goal,
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        error: `API request failed with status ${response.status}`,
      };
    }

    const data = await response.json();

    if (
      !data.choices ||
      !data.choices[0] ||
      !data.choices[0].message ||
      !data.choices[0].message.content
    ) {
      return {
        error: "Invalid response format from API",
      };
    }

    const content = data.choices[0].message.content;
    const cleanedText = cleanText(content);

    try {
      const parsed = JSON.parse(cleanedText);
      return parsed;
    } catch (parseError) {
      return {
        error: `JSON parse error: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      };
    }
  } catch (error) {
    return {
      error: `Request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

console.info("Breakdown Task Edge Function started");

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST requests are allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const payload: RequestPayload = await req.json();

    // Validate required fields
    if (!payload.goal) {
      return new Response(
        JSON.stringify({ error: "Missing required field: goal" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get API key from environment or request
    const apiKey =
      payload.apiKey || Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "Missing API key. Provide via apiKey field or DEEPSEEK_API_KEY environment variable",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await breakdownTask(
      payload.goal,
      apiKey,
      payload.baseUrl,
      payload.model,
      payload.systemPrompt
    );

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
