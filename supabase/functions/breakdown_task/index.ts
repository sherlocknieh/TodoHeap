import OpenAI from 'openai'
import {corsHeaders} from '../_shared/cors.ts'

const number = 3
const systemPrompt = `You are an AI assistant helping with task breakdown. 
Generate exactly ${number} an appropriate number of subtasks based on the provided prompt and context.

IMPORTANT: Your response MUST be a JSON object with a "subtasks" property containing an array of subtask objects. 
Each subtask must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- description: A detailed description (minimum 10 characters)
- details: Implementation details (minimum 20 characters)

You may optionally include a "metadata" object. Do not include any other top-level properties.
`;



interface RequestBody {
  todo: string;
  query: string;
}

function cleanText(text: string): string {
  // Clean AI response
  let cleaned = text.replace(/```json\n/g, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/\n/g, "");
  return cleaned;
}


Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
    }


  const body: RequestBody = await req.json()
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  const baseUrl = Deno.env.get('OPENAI_BASE_URL')
  let model = Deno.env.get('OPENAI_MODEL');

  if (!model || model === '') {
    model = 'deepseek-chat'
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  })

  // Documentation here: https://github.com/openai/openai-node
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      {role:'system',content:"Task need to be breakdown: "+body.todo},
      { role: 'user', content: body.query }
    ],
    model: model,
    stream: false,
  })

  const reply = chatCompletion.choices[0].message.content
  if (!reply) {
    return new Response('No reply from OpenAI', { status: 500 })
  }

  try {
    const parsed = JSON.parse(cleanText(reply))
    return new Response(JSON.stringify(parsed), {
      headers: {...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response('Invalid JSON response from OpenAI: ' + error, { status: 500,
      headers: {...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
