import assert from "node:assert/strict"
import test from "node:test"
import { run } from "../smoke.js"

// Helpers

const VALID_RESULTS_JSON = JSON.stringify({
  results: [{ title: "Python", url: "https://python.org", snippet: "The Python programming language", engines: ["google"], score: 1.0 }],
  query: "Python programming language",
  number_of_results: 1,
})

function makeScout(overrides = {}) {
  return async () => ({ result: VALID_RESULTS_JSON, costUsd: 0.01, isError: false, ...overrides })
}

function makeJudge(overrides = {}) {
  return async () => ({ result: "PASS results look relevant", costUsd: 0.01, isError: false, ...overrides })
}

function makeDockerLogs() {
  return async () => "some logs"
}

function makeEnv(overrides = {}) {
  return { SEARXNG_URL: "http://localhost:8888", ANTHROPIC_API_KEY: "test-key", ...overrides }
}

function makeDeps(overrides = {}) {
  return {
    scout: makeScout(),
    judge: makeJudge(),
    dockerLogs: makeDockerLogs(),
    env: makeEnv(),
    print: () => {},
    ...overrides,
  }
}

// Tests

test("exits_nonzero_whenSearxngUrlMissing", async () => {
  const code = await run(makeDeps({ env: makeEnv({ SEARXNG_URL: undefined }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenAnthropicApiKeyMissing", async () => {
  const code = await run(makeDeps({ env: makeEnv({ ANTHROPIC_API_KEY: undefined }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenScoutReturnsNoResult", async () => {
  const code = await run(makeDeps({ scout: makeScout({ result: null, costUsd: 0, isError: true }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenResultsJsonUnparseable", async () => {
  const code = await run(makeDeps({ scout: makeScout({ result: "not json", isError: false }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenResultsArrayEmpty", async () => {
  const emptyJson = JSON.stringify({ results: [], query: "Python programming language", number_of_results: 0 })
  const code = await run(makeDeps({ scout: makeScout({ result: emptyJson }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenResultMissingTitleOrUrl", async () => {
  const missingTitleJson = JSON.stringify({
    results: [{ url: "https://python.org", snippet: "test", engines: ["google"], score: 1.0 }],
    query: "Python programming language",
    number_of_results: 1,
  })
  const code = await run(makeDeps({ scout: makeScout({ result: missingTitleJson }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenJudgeVerdictIsFail", async () => {
  const code = await run(makeDeps({ judge: makeJudge({ result: "FAIL results not relevant" }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenJudgeVerdictIsUnparseable", async () => {
  const code = await run(makeDeps({ judge: makeJudge({ result: "maybe this is ok" }) }))
  assert.equal(code, 1)
})

test("logsUnavailable_doesNotAbort_scriptContinuesToJudge", async () => {
  let judgeWasCalled = false
  const deps = makeDeps({
    dockerLogs: async () => { throw new Error("docker not running") },
    judge: async (query, resultsJson, logs) => {
      judgeWasCalled = true
      return { result: "PASS ok", costUsd: 0.01, isError: false }
    },
  })
  const code = await run(deps)
  assert.equal(judgeWasCalled, true)
  assert.equal(code, 0)
})

test("exits_nonzero_whenScoutCostExceedsLimit", async () => {
  const code = await run(makeDeps({ scout: makeScout({ costUsd: 0.025 }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenJudgeCostExceedsLimit", async () => {
  const code = await run(makeDeps({ judge: makeJudge({ result: "PASS ok", costUsd: 0.04 }) }))
  assert.equal(code, 1)
})

test("exits_nonzero_whenTotalCostExceedsLimit", async () => {
  const code = await run(makeDeps({
    scout: makeScout({ costUsd: 0.02 }),
    judge: makeJudge({ result: "PASS ok", costUsd: 0.04 }),
  }))
  assert.equal(code, 1)
})

test("exits_zero_whenSearxngRunningAndResultsRelevant", async () => {
  const code = await run(makeDeps())
  assert.equal(code, 0)
})
