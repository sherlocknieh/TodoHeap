import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const info = {
    ok: true,
    name: "deploy_test",
    method: req.method,
    time: new Date().toISOString(),
  }

  return new Response(JSON.stringify(info), {
    headers: { "Content-Type": "application/json" },
  })
})
