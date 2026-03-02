import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)

const QUERY = "Python programming language"

// The Agent SDK spawns `claude` as a child process. When smoke.js runs
// inside an existing Claude Code session, CLAUDECODE is set and the child
// refuses to start. Strip it so the subprocess can launch cleanly.
function sdkEnv() {
  const env = { ...process.env }
  delete env.CLAUDECODE
  return env
}

// --- Real agent implementations ---

function makeScout(env) {
  return async function scout(query) {
    const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk")
    const indexPath = new URL("src/index.js", import.meta.url).pathname
    let resultMsg = null
    for await (const msg of sdkQuery({
      prompt: `Use the search tool to search for "${query}" and return only the raw JSON result verbatim, with no other text.`,
      options: {
        model: "claude-haiku-4-5",
        maxBudgetUsd: 0.02,
        permissionMode: "dontAsk",
        env: sdkEnv(),
        mcpServers: {
          "web-scout": {
            command: "node",
            args: [indexPath],
            env: { ...sdkEnv(), SEARXNG_URL: env.SEARXNG_URL },
          },
        },
      },
    })) {
      if (msg.type === "result") resultMsg = msg
    }
    if (!resultMsg) return { result: null, costUsd: 0, isError: true }
    return {
      result: resultMsg.is_error ? null : resultMsg.result,
      costUsd: resultMsg.total_cost_usd,
      isError: resultMsg.is_error,
    }
  }
}

function makeJudge() {
  return async function judge(query, resultsJson, logs) {
    const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk")
    let resultMsg = null
    for await (const msg of sdkQuery({
      prompt: `Evaluate these web search results for the query "${query}".\n\nResults JSON:\n${resultsJson}\n\nDocker logs:\n${logs}\n\nStart your answer with PASS or FAIL, then explain why.`,
      options: {
        model: "claude-haiku-4-5",
        maxBudgetUsd: 0.03,
        permissionMode: "dontAsk",
        allowedTools: [],
        env: sdkEnv(),
      },
    })) {
      if (msg.type === "result") resultMsg = msg
    }
    if (!resultMsg) return { result: null, costUsd: 0, isError: true }
    return {
      result: resultMsg.is_error ? null : resultMsg.result,
      costUsd: resultMsg.total_cost_usd,
      isError: resultMsg.is_error,
    }
  }
}

function makeDockerLogs() {
  return async function dockerLogs() {
    const { stdout } = await execFileAsync("docker", ["logs", "--tail", "50", "searxng"])
    return stdout
  }
}

// --- Core run function ---

export async function run({ scout, judge, dockerLogs, env = process.env, print = console.log } = {}) {
  if (!env.SEARXNG_URL) {
    print("FAIL: SEARXNG_URL environment variable is required")
    return 1
  }
  if (!env.ANTHROPIC_API_KEY) {
    print("FAIL: ANTHROPIC_API_KEY environment variable is required")
    return 1
  }

  const scoutRes = await scout(QUERY)
  if (scoutRes.isError || !scoutRes.result) {
    print("FAIL: scout agent returned no result or exceeded budget")
    return 1
  }
  if (scoutRes.costUsd > 0.02) {
    print(`FAIL: scout cost $${scoutRes.costUsd.toFixed(4)} exceeds $0.02 limit`)
    return 1
  }

  let parsed
  try {
    parsed = JSON.parse(scoutRes.result)
  } catch {
    print("FAIL: scout result is not valid JSON")
    return 1
  }

  if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
    print("FAIL: results array is empty")
    return 1
  }

  for (const r of parsed.results) {
    if (typeof r.title !== "string" || !r.title || typeof r.url !== "string" || !r.url) {
      print("FAIL: result missing non-empty title or url")
      return 1
    }
  }

  let logs
  try {
    logs = await dockerLogs()
  } catch {
    logs = "(unavailable)"
  }

  const judgeRes = await judge(QUERY, scoutRes.result, logs)
  if (judgeRes.costUsd > 0.03) {
    print(`FAIL: judge cost $${judgeRes.costUsd.toFixed(4)} exceeds $0.03 limit`)
    return 1
  }

  const totalCost = scoutRes.costUsd + judgeRes.costUsd
  if (totalCost > 0.05) {
    print(`FAIL: total cost $${totalCost.toFixed(4)} exceeds $0.05 limit`)
    return 1
  }

  const firstWord = judgeRes.result?.trim().split(/\s+/)[0]?.toUpperCase()
  if (firstWord !== "PASS" && firstWord !== "FAIL") {
    print("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
    return 1
  }
  if (firstWord === "FAIL") {
    print(`FAIL\n${judgeRes.result}\nScout cost: $${scoutRes.costUsd.toFixed(4)}\nJudge cost: $${judgeRes.costUsd.toFixed(4)}`)
    return 1
  }

  print(`PASS\n${judgeRes.result}\nScout cost: $${scoutRes.costUsd.toFixed(4)}\nJudge cost: $${judgeRes.costUsd.toFixed(4)}`)
  return 0
}

// --- CLI entry point ---

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({
    scout: makeScout(process.env),
    judge: makeJudge(),
    dockerLogs: makeDockerLogs(),
    env: process.env,
  }).then((code) => process.exit(code)).catch((err) => {
    console.error("FATAL:", err)
    process.exit(1)
  })
}
