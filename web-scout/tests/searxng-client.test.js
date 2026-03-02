import assert from "node:assert/strict"
import test from "node:test"
import { makeSearxngClient } from "../src/searxng-client.js"

test("search_shouldSendGetRequest_andReturnParsedResult", async (t) => {
  const fetchMock = t.mock.fn(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Example",
          url: "https://example.com",
          snippet: "An example",
          engines: ["google"],
          score: 1.5,
          category: "general",
          parsed_url: ["https", "example.com"]
        }
      ],
      query: "test",
      number_of_results: 1
    })
  }))
  const client = makeSearxngClient({
    baseUrl: "http://localhost:8888",
    fetch: fetchMock
  })

  const result = await client.search("test")

  // Correct URL with query and format=json
  assert.equal(fetchMock.mock.calls.length, 1)
  const [url] = fetchMock.mock.calls[0].arguments
  assert.equal(url, "http://localhost:8888/search?q=test&format=json")

  // Parsed response with extra fields dropped
  assert.deepEqual(result, {
    results: [
      {
        title: "Example",
        url: "https://example.com",
        snippet: "An example",
        engines: ["google"],
        score: 1.5
      }
    ],
    query: "test",
    number_of_results: 1
  })
})

test("search_shouldPassOptionalParams_whenProvided", async (t) => {
  const fetchMock = t.mock.fn(async () => ({
    ok: true,
    json: async () => ({ results: [], query: "test", number_of_results: 0 })
  }))
  const client = makeSearxngClient({
    baseUrl: "http://localhost:8888",
    fetch: fetchMock
  })

  await client.search("test", { categories: "general", language: "en", pageNo: 2 })

  const [url] = fetchMock.mock.calls[0].arguments
  const params = new URL(url).searchParams
  assert.equal(params.get("categories"), "general")
  assert.equal(params.get("language"), "en")
  assert.equal(params.get("pageno"), "2")
})

test("search_shouldReturnEmptyResults_whenSearxngReturnsNone", async (t) => {
  const fetchMock = t.mock.fn(async () => ({
    ok: true,
    json: async () => ({ results: [], query: "nothing", number_of_results: 0 })
  }))
  const client = makeSearxngClient({ baseUrl: "http://localhost:8888", fetch: fetchMock })

  const result = await client.search("nothing")

  assert.deepEqual(result, { results: [], query: "nothing", number_of_results: 0 })
})

test("search_shouldTruncateResults_toMaxResults", async (t) => {
  const threeResults = [
    { title: "A", url: "https://a.com", snippet: "a", engines: ["g"], score: 3 },
    { title: "B", url: "https://b.com", snippet: "b", engines: ["g"], score: 2 },
    { title: "C", url: "https://c.com", snippet: "c", engines: ["g"], score: 1 }
  ]
  const fetchMock = t.mock.fn(async () => ({
    ok: true,
    json: async () => ({ results: threeResults, query: "test", number_of_results: 3 })
  }))
  const client = makeSearxngClient({
    baseUrl: "http://localhost:8888",
    fetch: fetchMock,
    maxResults: 2
  })

  const result = await client.search("test")

  assert.equal(result.results.length, 2)
  assert.deepEqual(result.results.map(($0) => $0.title), ["A", "B"])
})
