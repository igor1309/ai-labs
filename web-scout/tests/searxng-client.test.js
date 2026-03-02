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
