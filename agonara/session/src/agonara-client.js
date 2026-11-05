export function createAgonaraClient({ baseUrl, login, password, fetch }) {
  if (!baseUrl || !login || !password || typeof fetch !== "function") {
    throw new Error("Agonara base URL, login, password and fetch are required");
  }
  const root = baseUrl.replace(/\/+$/, "");
  let cookie;

  // Response bodies and transport errors can contain credentials; report only the route.
  const failure = (method, route, status, reason) =>
    new Error(`${method} ${route} failed (HTTP ${status}): ${reason}`);

  async function request(method, route, headers, body) {
    try {
      return await fetch(`${root}${route}`, { method, headers, body, redirect: "error" });
    } catch {
      throw failure(method, route, "unavailable", "network error");
    }
  }

  async function accepted(response, method, route) {
    if (!response.ok) throw failure(method, route, response.status, "request rejected");
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw failure(method, route, response.status, "invalid JSON");
    }
    if (envelope?.status !== "accepted") {
      throw failure(method, route, response.status, "response not accepted");
    }
    return envelope.value;
  }

  async function signIn() {
    cookie = undefined;
    const route = "/identity/sessions";
    const response = await request("POST", route, {
      "content-type": "application/json",
      Origin: baseUrl,
    }, JSON.stringify({ login, password }));
    await accepted(response, "POST", route);
    const cookies = response.headers.getSetCookie?.() ??
      [response.headers.get("set-cookie")].filter(Boolean);
    cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
    if (!cookie) throw failure("POST", route, response.status, "session cookie missing");
  }

  async function read(route) {
    if (!cookie) await signIn();
    let response = await request("GET", route, { Cookie: cookie });
    if (response.status === 401) {
      await signIn();
      response = await request("GET", route, { Cookie: cookie });
    }
    return accepted(response, "GET", route);
  }

  return {
    listPrograms: () => read("/programs"),
    navigation: (programId) => read(`/programs/${encodeURIComponent(programId)}/navigation`),
    entity: (entityId) => read(`/navigation/entities/${encodeURIComponent(entityId)}`),
    materialContent: (entityId) => read(`/materials/${encodeURIComponent(entityId)}/content`),
  };
}
