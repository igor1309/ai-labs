import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

import { makeDeterministicWorkerFetch } from "./support/deterministic-worker-fetch.js"

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const webSourceDirectory = path.resolve(currentDirectory, "../src")
const runWebE2E = process.env.RUN_WEB_E2E === "1"

let browser = null
let browserSkipReason = null

before(async () => {
  if (!runWebE2E) {
    browserSkipReason = "Set RUN_WEB_E2E=1 to run web browser tests."
    return
  }

  try {
    browser = await chromium.launch(resolveBrowserLaunchOptions())
  } catch (error) {
    throw new Error(`Unable to launch browser for RUN_WEB_E2E=1: ${error.message}`)
  }
})

after(async () => {
  await browser?.close()
})

test("test_webE2E_shouldRenderAnswerSections_onHappyPath", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const workerServer = await startWorkerServer()
  const webServer = await startWebServer({
    workerBaseUrl: workerServer.origin
  })
  testContext.after(async () => {
    await webServer.close()
    await workerServer.close()
  })

  const page = await createPage()
  testContext.after(async () => {
    await page.context().close()
  })
  await page.goto(`${webServer.origin}/`)
  await page.fill("[data-testid='profession-input']", "software developer")
  await page.click("[data-testid='submit-button']")
  await page.waitForSelector("[data-testid='answer']:not([hidden])")

  const answerHeadline = await page.textContent("[data-testid='answer-headline']")
  const timeHorizonLabel = await page.textContent("[data-testid='answer-time-horizon-label']")
  const confidenceLabel = await page.textContent("[data-testid='answer-confidence-label']")
  const keyRiskItems = await page.$$eval(
    "[data-testid='answer-key-risks'] li",
    (itemElements) => itemElements.map(($0) => $0.textContent)
  )

  assert.equal(answerHeadline, "Software Engineer remains viable with evolving workflows.")
  assert.equal(timeHorizonLabel, "2-4 years")
  assert.equal(confidenceLabel, "medium")
  assert.deepEqual(keyRiskItems, ["Routine tasks are increasingly automated."])
})

test("test_webE2E_shouldRenderClarificationState_onAmbiguousInput", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const workerServer = await startWorkerServer()
  const webServer = await startWebServer({
    workerBaseUrl: workerServer.origin
  })
  testContext.after(async () => {
    await webServer.close()
    await workerServer.close()
  })

  const page = await createPage()
  testContext.after(async () => {
    await page.context().close()
  })
  await page.goto(`${webServer.origin}/`)
  await page.fill("[data-testid='profession-input']", "not sure")
  await page.click("[data-testid='submit-button']")
  await page.waitForSelector("[data-testid='clarification']:not([hidden])")

  const clarificationMessage = await page.textContent("[data-testid='clarification-message']")
  const suggestionItems = await page.$$eval(
    "[data-testid='clarification-suggestions'] li",
    (itemElements) => itemElements.map(($0) => $0.textContent)
  )

  assert.equal(clarificationMessage, "Please clarify the profession so I can provide a useful outlook.")
  assert.deepEqual(suggestionItems, ["software engineer", "registered nurse", "electrician"])
})

test("test_webE2E_shouldRenderTransportFailureState_onWorkerTimeout", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const workerServer = await startWorkerServer({
    modelDelayMs: "120"
  })
  const webServer = await startWebServer({
    workerBaseUrl: workerServer.origin
  })
  testContext.after(async () => {
    await webServer.close()
    await workerServer.close()
  })

  const page = await createPage()
  testContext.after(async () => {
    await page.context().close()
  })
  await page.goto(`${webServer.origin}/?timeoutMs=10`)
  await page.fill("[data-testid='profession-input']", "software developer")
  await page.click("[data-testid='submit-button']")
  await page.waitForSelector("[data-testid='transport-error']:not([hidden])")

  const errorMessage = await page.textContent("[data-testid='transport-error']")

  assert.equal(errorMessage, "Request failed. Please try again.")
})

async function createPage() {
  const browserContext = await browser.newContext()
  return browserContext.newPage()
}

function skipWhenBrowserUnavailable(testContext) {
  if (browser !== null) {
    return false
  }

  testContext.skip(browserSkipReason ?? "Web browser is unavailable.")
  return true
}

function createServerHandle(server) {
  return {
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
    origin: `http://127.0.0.1:${server.address().port}`
  }
}

function parseNodeHttpRequestBody(nodeRequest) {
  return new Promise((resolve, reject) => {
    const chunks = []

    nodeRequest.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    nodeRequest.on("end", () => {
      resolve(Buffer.concat(chunks))
    })
    nodeRequest.on("error", reject)
  })
}

function resolveBrowserLaunchOptions() {
  const configuredChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL

  if (configuredChannel) {
    return {
      channel: configuredChannel,
      headless: true
    }
  }

  if (process.platform === "darwin") {
    return {
      channel: "chrome",
      headless: true
    }
  }

  return { headless: true }
}

async function startWebServer({ workerBaseUrl }) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost")

    if (requestUrl.pathname === "/api/outlook" || requestUrl.pathname === "/health") {
      await proxyToWorker({
        nodeRequest: request,
        nodeResponse: response,
        workerBaseUrl
      })
      return
    }

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      await writeStaticFileResponse({
        nodeResponse: response,
        filePath: path.join(webSourceDirectory, "index.html"),
        contentType: "text/html; charset=utf-8"
      })
      return
    }

    if (requestUrl.pathname === "/app.js") {
      await writeStaticFileResponse({
        nodeResponse: response,
        filePath: path.join(webSourceDirectory, "app.js"),
        contentType: "application/javascript; charset=utf-8"
      })
      return
    }

    if (requestUrl.pathname === "/styles.css") {
      await writeStaticFileResponse({
        nodeResponse: response,
        filePath: path.join(webSourceDirectory, "styles.css"),
        contentType: "text/css; charset=utf-8"
      })
      return
    }

    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8"
    })
    response.end("Not found")
  })

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

  return createServerHandle(server)
}

async function startWorkerServer({ modelDelayMs = "0" } = {}) {
  const workerFetch = makeDeterministicWorkerFetch({
    delayMs: Number.parseInt(modelDelayMs, 10)
  })

  const server = createServer(async (request, response) => {
    const body = await parseNodeHttpRequestBody(request)
    const workerRequest = new Request(`http://worker.local${request.url ?? "/"}`, {
      body: body.length > 0 ? body : undefined,
      headers: request.headers,
      method: request.method
    })
    const workerResponse = await workerFetch(workerRequest)
    const responseBody = await workerResponse.arrayBuffer()
    const responseHeaders = {}

    workerResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    response.writeHead(workerResponse.status, responseHeaders)
    response.end(Buffer.from(responseBody))
  })

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

  return createServerHandle(server)
}

async function proxyToWorker({ nodeRequest, nodeResponse, workerBaseUrl }) {
  const requestUrl = new URL(nodeRequest.url ?? "/", workerBaseUrl)
  const requestBody = await parseNodeHttpRequestBody(nodeRequest)
  const proxiedResponse = await fetch(requestUrl, {
    body: requestBody.length > 0 ? requestBody : undefined,
    headers: {
      "content-type": nodeRequest.headers["content-type"] ?? "application/json"
    },
    method: nodeRequest.method
  })
  const responseBody = await proxiedResponse.arrayBuffer()
  const responseHeaders = {}

  proxiedResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  nodeResponse.writeHead(proxiedResponse.status, responseHeaders)
  nodeResponse.end(Buffer.from(responseBody))
}

async function writeStaticFileResponse({ nodeResponse, filePath, contentType }) {
  const fileContent = await readFile(filePath)

  nodeResponse.writeHead(200, {
    "content-type": contentType
  })
  nodeResponse.end(fileContent)
}
