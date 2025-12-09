import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {corsHeaders} from '../_shared/cors.ts'

console.log("Hello from Functions!")

Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }


  const { name } = await req.json()
  const data = {
    message: `Hello ${name}!`,
  }

  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})