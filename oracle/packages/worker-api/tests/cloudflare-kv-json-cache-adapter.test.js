import assert from "node:assert/strict"
import test from "node:test"

test("test_read_shouldReturnNull_onKvMiss", async () => {
  const adapterModule = await loadAdapterModule()
  const kvSpy = makeCloudflareKvNamespaceSpy({ getResult: null })
  const cacheAdapter = adapterModule?.createCloudflareKvJsonCacheAdapter?.({ kv: kvSpy.kv })

  const result = await cacheAdapter?.read("normalizer:en-US:software developer")

  assert.equal(result, null)
})

function makeCloudflareKvNamespaceSpy({ getResult }) {
  return {
    kv: {
      async get() {
        return getResult
      },
      async put() {}
    }
  }
}

async function loadAdapterModule() {
  try {
    return await import("../src/cloudflare-kv-json-cache-adapter.js")
  } catch {
    return null
  }
}
