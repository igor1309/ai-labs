/** @param {{ baseUrl: string, fetch?: typeof globalThis.fetch, timeoutMs?: number, maxResults?: number }} options */
export function makeSearxngClient({ baseUrl, fetch: fetchFn = globalThis.fetch, timeoutMs, maxResults }) {
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

      const response = await fetchFn(url.toString())
      const data = await response.json()

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
