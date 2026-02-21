import assert from "node:assert/strict"
import test from "node:test"

import { createCloudflareKvJsonCacheAdapter } from "../src/cloudflare-kv-json-cache-adapter.js"

test("test_createCloudflareKvJsonCacheAdapter_shouldThrowMissingDependencyError_onMissingKv", () => {
  assert.throws(() => createCloudflareKvJsonCacheAdapter(), { message: "Missing required dependency: kv" })
})

test("test_createCloudflareKvJsonCacheAdapter_shouldThrowInvalidDependencyError_onKvWithoutGetMethod", () => {
  assert.throws(() => createCloudflareKvJsonCacheAdapter({
    kv: {
      async put() {}
    }
  }), { message: "Invalid dependency: kv.get" })
})

test("test_createCloudflareKvJsonCacheAdapter_shouldThrowInvalidDependencyError_onKvWithoutPutMethod", () => {
  assert.throws(() => createCloudflareKvJsonCacheAdapter({
    kv: {
      async get() {
        return null
      }
    }
  }), { message: "Invalid dependency: kv.put" })
})

test("test_read_shouldReturnNull_onKvMiss", async () => {
  const cacheKey = "normalizer:en-US:software developer"
  const kvSpy = makeCloudflareKvNamespaceSpy({ getResult: null })
  const cacheAdapter = createCloudflareKvJsonCacheAdapter({ kv: kvSpy.kv })

  const result = await cacheAdapter.read(cacheKey)

  assert.equal(result, null)
})

test("test_read_shouldReturnParsedValue_onJsonHit", async () => {
  const cacheKey = "normalizer:en-US:software developer"
  const cachedValue = {
    canonicalProfession: "software engineer",
    needsClarification: false
  }
  const kvSpy = makeCloudflareKvNamespaceSpy({ getResult: JSON.stringify(cachedValue) })
  const cacheAdapter = createCloudflareKvJsonCacheAdapter({ kv: kvSpy.kv })

  const result = await cacheAdapter.read(cacheKey)

  assert.deepEqual(result, cachedValue)
})

test("test_read_shouldReturnNull_onInvalidJsonString", async () => {
  const cacheKey = "normalizer:en-US:software developer"
  const kvSpy = makeCloudflareKvNamespaceSpy({ getResult: "{invalid-json" })
  const cacheAdapter = createCloudflareKvJsonCacheAdapter({ kv: kvSpy.kv })

  const result = await cacheAdapter.read(cacheKey)

  assert.equal(result, null)
})

test("test_write_shouldCallPutWithJsonString_onWrite", async () => {
  const cacheKey = "normalizer:en-US:software developer"
  const cacheValue = {
    canonicalProfession: "software engineer",
    needsClarification: false
  }
  const kvSpy = makeCloudflareKvNamespaceSpy({ getResult: null })
  const cacheAdapter = createCloudflareKvJsonCacheAdapter({ kv: kvSpy.kv })

  await cacheAdapter.write(cacheKey, cacheValue)

  assert.deepEqual(kvSpy.putCalls, [{
    argsCount: 2,
    key: cacheKey,
    options: undefined,
    value: JSON.stringify(cacheValue)
  }])
})

function makeCloudflareKvNamespaceSpy({ getResult }) {
  const putCalls = []

  return {
    putCalls,
    kv: {
      async get() {
        return getResult
      },
      async put(key, value) {
        putCalls.push({
          argsCount: arguments.length,
          key,
          options: arguments[2],
          value
        })
      }
    }
  }
}
