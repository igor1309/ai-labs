import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

import { chromium, devices } from "@playwright/test"

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const publicDirectory = path.resolve(currentDirectory, "../public")
const runE2E = process.env.RUN_NTFY_SENDER_E2E === "1"

const NTFY_SERVER = "https://ntfy.test"
const NTFY_ROUTE = `${NTFY_SERVER}/**`
const TOPIC = "e2e-topic"
const TOKEN = "tk_e2e_secret"

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json"
}

let browser = null
let browserSkipReason = null
let webServer = null
let pagesHeaders = null

before(async () => {
  if (!runE2E) {
    browserSkipReason = "Set RUN_NTFY_SENDER_E2E=1 to run ntfy-sender browser tests."
    return
  }

  pagesHeaders = parsePagesHeaders(await readFile(path.join(publicDirectory, "_headers"), "utf8"))
  webServer = await startStaticServer(pagesHeaders)

  try {
    browser = await chromium.launch(resolveBrowserLaunchOptions())
  } catch (error) {
    throw new Error(`Unable to launch browser for RUN_NTFY_SENDER_E2E=1: ${error.message}`)
  }
})

after(async () => {
  await browser?.close()
  await webServer?.close()
})

test("test_page_shouldShowSettingsWithCSP_onFirstRun", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page } = await openPage(testContext)
  const response = await page.goto(`${webServer.origin}/`)

  assert.equal(
    response.headers()["content-security-policy"],
    pagesHeaders["Content-Security-Policy"]
  )
  assert.equal(await page.isVisible("#settings"), true)
  assert.equal(await page.textContent("#toggle-settings"), "Close")
  assert.equal(await page.inputValue("#server"), "https://ntfy.sh")
  assert.equal(await page.inputValue("#topic"), "")
  assert.equal(await page.isVisible("#history-card"), false)
})

test("test_page_shouldPostJsonWithOptionsAndToken_onSend", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page, ntfy } = await openPage(testContext)
  await page.goto(`${webServer.origin}/`)
  await configureSettings(page, { server: `${NTFY_SERVER}/`, topic: TOPIC, token: TOKEN })

  await page.fill("#title", "Deploy")
  await page.fill("#message", "Build finished")
  await page.click("#more summary")
  await page.selectOption("#priority", "4")
  await page.fill("#tags", "warning, tada")
  await page.click("#send")
  await page.waitForSelector("#status.ok")

  assert.deepEqual(ntfy.posts(), [
    {
      url: `${NTFY_SERVER}/`,
      method: "POST",
      authorization: `Bearer ${TOKEN}`,
      body: {
        topic: TOPIC,
        message: "Build finished",
        title: "Deploy",
        priority: 4,
        tags: ["warning", "tada"]
      }
    }
  ])
  assert.equal(await page.textContent("#status"), "Sent ✓")
  assert.equal(await page.locator("#history li").count(), 1)
  assert.equal(await page.textContent("#history li .history-msg"), "Build finished")
  assert.equal(await page.inputValue("#message"), "")
  assert.equal(await page.inputValue("#title"), "")
})

test("test_page_shouldOmitDefaultPriorityAndAuthorization_onSendWithoutToken", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page, ntfy } = await openPage(testContext)
  await page.goto(`${webServer.origin}/`)
  await configureSettings(page, { server: NTFY_SERVER, topic: TOPIC, token: "" })

  await page.fill("#message", "Plain message")
  await page.click("#send")
  await page.waitForSelector("#status.ok")

  assert.deepEqual(ntfy.posts(), [
    {
      url: `${NTFY_SERVER}/`,
      method: "POST",
      authorization: undefined,
      body: { topic: TOPIC, message: "Plain message" }
    }
  ])
})

test("test_page_shouldShowServerError_onForbidden", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page, ntfy } = await openPage(testContext, {
    status: 403,
    body: { code: 40301, http: 403, error: "forbidden" }
  })
  await page.goto(`${webServer.origin}/`)
  await configureSettings(page, { server: NTFY_SERVER, topic: TOPIC, token: TOKEN })

  await page.fill("#message", "Denied message")
  await page.click("#send")
  await page.waitForSelector("#status.err")

  const statusText = await page.textContent("#status")
  assert.equal(ntfy.posts().length, 1)
  assert.match(statusText, /HTTP 403/)
  assert.match(statusText, /forbidden/)
  assert.equal(await page.getAttribute("#status", "class"), "err")
  assert.equal(await page.isVisible("#history-card"), false)
  assert.equal(await page.locator("#history li").count(), 0)
  assert.equal(await page.inputValue("#message"), "Denied message")
})

test("test_page_shouldNotSend_onMissingTopic", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page, ntfy } = await openPage(testContext)
  await page.goto(`${webServer.origin}/`)
  await page.click("#save-settings")
  assert.equal(await page.isVisible("#settings"), false)

  await page.fill("#message", "No topic yet")
  await page.click("#send")
  await page.waitForSelector("#status.err")

  assert.deepEqual(ntfy.requests, [])
  assert.equal(await page.isVisible("#settings"), true)
  assert.equal(await page.textContent("#status"), "Set a topic in Settings first.")
})

test("test_page_shouldPersistSettingsAndHistory_onReload", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page } = await openPage(testContext)
  await page.goto(`${webServer.origin}/`)
  await configureSettings(page, { server: NTFY_SERVER, topic: TOPIC, token: TOKEN })
  await page.fill("#message", "Survives reload")
  await page.click("#send")
  await page.waitForSelector("#status.ok")

  await page.reload()

  assert.equal(await page.isVisible("#settings"), false)
  assert.equal(await page.inputValue("#server"), NTFY_SERVER)
  assert.equal(await page.inputValue("#topic"), TOPIC)
  assert.equal(await page.inputValue("#token"), TOKEN)
  assert.equal(await page.isVisible("#history-card"), true)
  assert.equal(await page.locator("#history li").count(), 1)
  assert.equal(await page.textContent("#history li .history-msg"), "Survives reload")
})

test("test_page_shouldRaiseNoErrorsOrCSPViolations_onSuccessfulSend", async (testContext) => {
  if (skipWhenBrowserUnavailable(testContext)) {
    return
  }

  const { page, ntfy } = await openPage(testContext)
  const pageErrors = []
  const cspConsoleMessages = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) {
      cspConsoleMessages.push(message.text())
    }
  })
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })

  await page.goto(`${webServer.origin}/`)
  await configureSettings(page, { server: NTFY_SERVER, topic: TOPIC, token: TOKEN })
  await page.fill("#message", "Clean send")
  await page.click("#send")
  await page.waitForSelector("#status.ok")

  assert.equal(ntfy.posts().length, 1)
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(cspConsoleMessages, [])
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), [])
})

async function openPage(testContext, ntfyResponse = { status: 200, body: { id: "msg1", event: "message" } }) {
  const { defaultBrowserType: _ignored, ...iPhone } = devices["iPhone 13"]
  const browserContext = await browser.newContext(iPhone)
  testContext.after(async () => {
    await browserContext.close()
  })

  const ntfy = mockNtfy(ntfyResponse)
  const page = await browserContext.newPage()
  await page.route(NTFY_ROUTE, ntfy.handle)
  return { page, ntfy }
}

function mockNtfy({ status, body }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type"
  }
  const requests = []

  return {
    requests,
    posts() {
      return requests.filter((request) => request.method === "POST")
    },
    async handle(route) {
      const request = route.request()
      const postData = request.postData()
      requests.push({
        url: request.url(),
        method: request.method(),
        authorization: request.headers()["authorization"],
        body: postData ? JSON.parse(postData) : undefined
      })

      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders })
        return
      }

      await route.fulfill({
        status,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify(body)
      })
    }
  }
}

async function configureSettings(page, { server, topic, token }) {
  if (!(await page.isVisible("#settings"))) {
    await page.click("#toggle-settings")
  }
  await page.fill("#server", server)
  await page.fill("#topic", topic)
  await page.fill("#token", token)
  await page.click("#save-settings")
  await page.waitForSelector("#settings", { state: "hidden" })
}

function skipWhenBrowserUnavailable(testContext) {
  if (browser !== null) {
    return false
  }

  testContext.skip(browserSkipReason ?? "Browser is unavailable.")
  return true
}

function resolveBrowserLaunchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  return executablePath ? { executablePath, headless: true } : { headless: true }
}

// Cloudflare Pages `_headers`: a path line, then indented `Name: value` lines.
function parsePagesHeaders(source) {
  const headers = {}
  let inAllPathsBlock = false

  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue
    }

    if (!/^\s/.test(line)) {
      inAllPathsBlock = line.trim() === "/*"
      continue
    }

    if (inAllPathsBlock) {
      const separator = line.indexOf(":")
      headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
    }
  }

  if (!headers["Content-Security-Policy"]) {
    throw new Error("public/_headers has no Content-Security-Policy for /*")
  }
  return headers
}

async function startStaticServer(responseHeaders) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
    const filePath = path.resolve(publicDirectory, relativePath)
    const contentType = CONTENT_TYPES[path.extname(filePath)]

    if (!filePath.startsWith(publicDirectory + path.sep) || contentType === undefined) {
      response.writeHead(404, responseHeaders)
      response.end()
      return
    }

    try {
      const content = await readFile(filePath)
      response.writeHead(200, { ...responseHeaders, "Content-Type": contentType })
      response.end(content)
    } catch {
      response.writeHead(404, responseHeaders)
      response.end()
    }
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}
