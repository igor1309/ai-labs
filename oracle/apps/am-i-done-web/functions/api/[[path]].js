export async function onRequest(context) {
  const apiBaseUrl = resolveApiBaseUrl(context.env?.API_BASE_URL)
  const upstreamRequest = createUpstreamRequest({
    apiBaseUrl,
    request: context.request
  })

  return fetch(upstreamRequest)
}

export function resolveApiBaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Missing required API_BASE_URL for Pages API proxy.")
  }

  const trimmedValue = value.trim()

  try {
    new URL(trimmedValue)
  } catch {
    throw new Error("Missing required API_BASE_URL for Pages API proxy.")
  }

  return trimmedValue
}

export function createUpstreamRequest({ apiBaseUrl, request }) {
  const requestUrl = new URL(request.url)
  const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, apiBaseUrl)

  return new Request(upstreamUrl, request)
}
