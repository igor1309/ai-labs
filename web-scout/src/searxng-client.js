const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_MAX_RESULTS = 10

/** @param {{ baseUrl: string, fetch?: typeof globalThis.fetch, timeoutMs?: number, maxResults?: number }} options */
export function makeSearxngClient({ baseUrl, fetch: fetchFn = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxResults = DEFAULT_MAX_RESULTS }) {
  return {
    async search(query, options) {
      if (!query || !query.trim()) {
        throw new Error("Empty query")
      }
      const url = new URL("/search", baseUrl)
      url.searchParams.set("q", query)
      url.searchParams.set("format", "json")
      if (options?.categories) url.searchParams.set("categories", options.categories)
      if (options?.language) url.searchParams.set("language", options.language)
      if (options?.pageNo) url.searchParams.set("pageno", String(options.pageNo))

      let response
      try {
        response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(timeoutMs) })
      } catch (err) {
        if (err.name === "AbortError" || err.name === "TimeoutError") {
          throw new Error(`SearXNG request timeout after ${timeoutMs}ms`)
        }
        throw err
      }
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`SearXNG request failed with status ${response.status}: ${body}`)
      }
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error("Invalid JSON response from SearXNG")
      }

      const mapped = data.results.map(($0) => ({
        title: $0.title,
        url: $0.url,
        snippet: $0.snippet,
        engines: $0.engines,
        score: $0.score
      }))
      return {
        results: maxResults != null ? mapped.slice(0, maxResults) : mapped,
        query: data.query,
        number_of_results: data.number_of_results
      }
    }
  }
}
