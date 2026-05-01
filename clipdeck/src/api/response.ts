export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

export function unauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}
