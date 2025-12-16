const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function corsWrapper(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const response = await handler(req);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: { ...corsHeaders, ...response.headers },
    });
  };
}