import assert from "node:assert/strict"
import test from "node:test"

import { createProfessionNormalizer, normalizeProfession } from "../src/profession-normalizer.js"
import * as professionNormalizerModule from "../src/profession-normalizer.js"

test("test_moduleExports_shouldExposeProfessionNormalizerServiceWithNormalizeMethod_onImport", () => {
  assert.equal(typeof professionNormalizerModule.professionNormalizer?.normalize, "function")
})

test("test_professionNormalizer_shouldThrowNotConfiguredError_onNormalizeBeforeConfiguration", async () => {
  await assert.rejects(() => professionNormalizerModule.professionNormalizer.normalize({
    locale: "en-US",
    profession: "software developer"
  }), { message: "professionNormalizer is not configured" })
})

test("test_professionNormalizer_shouldDelegateNormalizeToConfiguredService_onConfiguredDependencies", async () => {
  const cachedResult = makeCanonicalResult("configured profession")
  const cacheSpy = makeCacheSpy(cachedResult)
  const modelClientSpy = makeModelClientSpy(makeCanonicalResult("ignored"))
  assert.equal(typeof professionNormalizerModule.configureProfessionNormalizer, "function")

  professionNormalizerModule.configureProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })

  const result = await professionNormalizerModule.professionNormalizer.normalize({
    locale: "en-US",
    profession: "  software   developer  "
  })

  assert.deepEqual(result, cachedResult)
})

test("test_createProfessionNormalizer_shouldThrowMissingDependencyError_onMissingCache", () => {
  assert.throws(() => createProfessionNormalizer({
    cacheVersion: "1",
    modelClient: makeModelClientSpy(makeCanonicalResult("software engineer")).client
  }), { message: "Missing required dependency: cache" })
})

test("test_createProfessionNormalizer_shouldThrowInvalidDependencyError_onCacheWithoutReadMethod", () => {
  assert.throws(() => createProfessionNormalizer({
    cache: {},
    cacheVersion: "1",
    modelClient: makeModelClientSpy(makeCanonicalResult("software engineer")).client
  }), { message: "Invalid dependency: cache.read" })
})

test("test_createProfessionNormalizer_shouldThrowInvalidDependencyError_onCacheWithoutWriteMethod", () => {
  assert.throws(() => createProfessionNormalizer({
    cache: {
      async read() {}
    },
    cacheVersion: "1",
    modelClient: makeModelClientSpy(makeCanonicalResult("software engineer")).client
  }), { message: "Invalid dependency: cache.write" })
})

test("test_createProfessionNormalizer_shouldThrowMissingDependencyError_onMissingModelClient", () => {
  assert.throws(() => createProfessionNormalizer({
    cache: makeCacheSpy(null).cache,
    cacheVersion: "1"
  }), { message: "Missing required dependency: modelClient" })
})

test("test_createProfessionNormalizer_shouldThrowMissingDependencyError_onMissingCacheVersion", () => {
  assert.throws(() => createProfessionNormalizer({
    cache: makeCacheSpy(null).cache,
    modelClient: makeModelClientSpy(makeCanonicalResult("software engineer")).client
  }), { message: "Missing required dependency: cacheVersion" })
})

test("test_createProfessionNormalizer_shouldThrowInvalidDependencyError_onModelClientWithoutNormalizeMethod", () => {
  assert.throws(() => createProfessionNormalizer({
    cache: makeCacheSpy(null).cache,
    cacheVersion: "1",
    modelClient: {}
  }), { message: "Invalid dependency: modelClient.normalize" })
})

test("test_normalize_shouldReturnCachedResultWithoutCallingModelClient_onCacheHit", async () => {
  const cachedResult = makeCanonicalResult("cached profession")
  const cacheSpy = makeCacheSpy(cachedResult)
  const modelClientSpy = makeModelClientSpy(makeCanonicalResult("model profession"))
  const professionNormalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })

  const result = await professionNormalizer.normalize({ locale: "en-US", profession: "  software   developer  " })

  assert.deepEqual(result, cachedResult)
  assert.deepEqual(modelClientSpy.calls, [])
})

test("test_normalize_shouldCallModelClientWithNormalizedProfessionWriteCacheAndReturnModelResult_onCacheMiss", async () => {
  const modelResult = makeCanonicalResult("software engineer")
  const cacheSpy = makeCacheSpy(null)
  const modelClientSpy = makeModelClientSpy(modelResult)
  const professionNormalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })

  const result = await professionNormalizer.normalize({ locale: "en-US", profession: "  software   developer  " })

  assert.deepEqual(result, modelResult)
  assert.deepEqual(modelClientSpy.calls, [{ locale: "en-US", profession: "software developer" }])
  assert.deepEqual(cacheSpy.writeCalls, [{
    key: "normalizer:1:en-US:software developer",
    value: modelResult
  }])
})

test("test_normalize_shouldTreatUndefinedCacheReadAsMiss_onCacheReadReturnsUndefined", async () => {
  const modelResult = makeCanonicalResult("software engineer")
  const cacheSpy = makeCacheSpy(undefined)
  const modelClientSpy = makeModelClientSpy(modelResult)
  const professionNormalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })

  const result = await professionNormalizer.normalize({ locale: "en-US", profession: "software developer" })

  assert.deepEqual(result, modelResult)
  assert.deepEqual(modelClientSpy.calls, [{ locale: "en-US", profession: "software developer" }])
})

test("test_normalize_shouldUseLocaleAndNormalizedProfessionInCacheKey_onNormalizeCall", async () => {
  const cachedResult = makeCanonicalResult("software engineer")
  const cacheSpy = makeCacheSpy(cachedResult)
  const professionNormalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: makeModelClientSpy(makeCanonicalResult("ignored")).client
  })

  await professionNormalizer.normalize({ locale: "en-US", profession: "  software   developer " })

  assert.deepEqual(cacheSpy.readCalls, ["normalizer:1:en-US:software developer"])
})

test("test_normalize_shouldPartitionCacheKey_onDifferentCacheVersion", async () => {
  const cacheSpy = makeCacheSpy(null)
  const modelClientSpy = makeModelClientSpy(makeCanonicalResult("software engineer"))
  const v1Normalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })
  const v2Normalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "2",
    modelClient: modelClientSpy.client
  })

  await v1Normalizer.normalize({ locale: "en", profession: "software developer" })
  await v2Normalizer.normalize({ locale: "en", profession: "software developer" })

  assert.deepEqual(cacheSpy.readCalls, ["normalizer:1:en:software developer", "normalizer:2:en:software developer"])
})

test("test_normalizeProfession_shouldTrimAndCollapseInternalWhitespace_onInputWithPaddingAndMultipleSpaces", () => {
  const result = normalizeProfession("  software   developer  ")

  assert.equal(result, "software developer")
})

test("test_normalize_shouldReturnAndCacheClarificationResultAsIs_onCacheMissWithClarificationResult", async () => {
  const modelResult = {
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    needsClarification: true
  }
  const cacheSpy = makeCacheSpy(null)
  const modelClientSpy = makeModelClientSpy(modelResult)
  const professionNormalizer = createProfessionNormalizer({
    cache: cacheSpy.cache,
    cacheVersion: "1",
    modelClient: modelClientSpy.client
  })

  const result = await professionNormalizer.normalize({ locale: "en-US", profession: "  software   developer  " })

  assert.deepEqual(result, modelResult)
  assert.deepEqual(cacheSpy.writeCalls, [{
    key: "normalizer:1:en-US:software developer",
    value: modelResult
  }])
})

function makeCanonicalResult(canonicalProfession) {
  return {
    canonicalProfession,
    category: "knowledge-work",
    categoryConfidence: 0.9,
    needsClarification: false
  }
}

function makeCacheSpy(readResult) {
  const readCalls = []
  const writeCalls = []

  return {
    readCalls,
    writeCalls,
    cache: {
      async read(key) {
        readCalls.push(key)
        return readResult
      },
      async write(key, value) {
        writeCalls.push({ key, value })
      }
    }
  }
}

function makeModelClientSpy(result) {
  const calls = []

  return {
    calls,
    client: {
      async normalize(input) {
        calls.push(input)
        return result
      }
    }
  }
}
