import assert from "node:assert/strict"
import test from "node:test"

import { createProfessionOutlookService } from "../src/profession-outlook.js"

test("test_createProfessionOutlookService_shouldThrowMissingDependencyError_onMissingCache", () => {
  assert.throws(() => createProfessionOutlookService({
    modelClient: makeOutlookModelClientSpy().modelClient,
    promptVersion: "prompt-v1"
  }), { message: "Missing required dependency: cache" })
})

test("test_createProfessionOutlookService_shouldThrowInvalidDependencyError_onCacheWithoutReadMethod", () => {
  assert.throws(() => createProfessionOutlookService({
    cache: {
      async write() {}
    },
    modelClient: makeOutlookModelClientSpy().modelClient,
    promptVersion: "prompt-v1"
  }), { message: "Invalid dependency: cache.read" })
})

test("test_createProfessionOutlookService_shouldThrowInvalidDependencyError_onCacheWithoutWriteMethod", () => {
  assert.throws(() => createProfessionOutlookService({
    cache: {
      async read() {}
    },
    modelClient: makeOutlookModelClientSpy().modelClient,
    promptVersion: "prompt-v1"
  }), { message: "Invalid dependency: cache.write" })
})

test("test_createProfessionOutlookService_shouldThrowMissingDependencyError_onMissingModelClient", () => {
  assert.throws(() => createProfessionOutlookService({
    cache: makeOutlookCacheSpy().cache,
    promptVersion: "prompt-v1"
  }), { message: "Missing required dependency: modelClient" })
})

test("test_createProfessionOutlookService_shouldThrowInvalidDependencyError_onModelClientWithoutGenerateMethod", () => {
  assert.throws(() => createProfessionOutlookService({
    cache: makeOutlookCacheSpy().cache,
    modelClient: {},
    promptVersion: "prompt-v1"
  }), { message: "Invalid dependency: modelClient.generate" })
})

test("test_createProfessionOutlookService_shouldThrowInvalidDependencyError_onInvalidPromptVersion", () => {
  assert.throws(() => createProfessionOutlookService({
    cache: makeOutlookCacheSpy().cache,
    modelClient: makeOutlookModelClientSpy().modelClient,
    promptVersion: "   "
  }), { message: "Invalid dependency: promptVersion" })
})

test("test_getOutlook_shouldReturnCachedAnswer_onCacheHit", async () => {
  const cachedAnswer = makeOutlookAnswer()
  const { professionOutlookService } = makeSUT({ cacheReadResult: cachedAnswer })

  const answer = await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(answer, cachedAnswer)
})

test("test_getOutlook_shouldNotCallModelClient_onCacheHit", async () => {
  const cachedAnswer = makeOutlookAnswer()
  const { modelClientSpy, professionOutlookService } = makeSUT({ cacheReadResult: cachedAnswer })

  await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(modelClientSpy.generateCalls, [])
})

test("test_getOutlook_shouldReadCacheWithCanonicalProfessionLocaleSchemaVersionAndPromptVersion_onOutlookRequest", async () => {
  const { outlookCacheSpy, professionOutlookService } = makeSUT()

  await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(outlookCacheSpy.readCalls, [makeOutlookCacheKey()])
})

test("test_getOutlook_shouldReturnModelAnswer_onCacheMiss", async () => {
  const modelAnswer = makeOutlookAnswer({
    headline: "New model answer"
  })
  const { professionOutlookService } = makeSUT({ cacheReadResult: null, modelAnswer })

  const answer = await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(answer, modelAnswer)
})

test("test_getOutlook_shouldCallModelClientWithInputHintsAndPromptVersion_onCacheMiss", async () => {
  const { modelClientSpy, professionOutlookService } = makeSUT()
  const input = makeOutlookInput({
    hints: {
      category: "knowledge-work",
      categoryConfidence: 0.9
    }
  })

  await professionOutlookService.getOutlook(input)

  assert.deepEqual(modelClientSpy.generateCalls, [{
    canonicalProfession: "software engineer",
    hints: {
      category: "knowledge-work",
      categoryConfidence: 0.9
    },
    locale: "en-US",
    promptVersion: "prompt-v1",
    schemaVersion: "1"
  }])
})

test("test_getOutlook_shouldWriteModelAnswerToCache_onCacheMiss", async () => {
  const modelAnswer = makeOutlookAnswer({
    headline: "Model output"
  })
  const { outlookCacheSpy, professionOutlookService } = makeSUT({ modelAnswer })

  await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(outlookCacheSpy.writeCalls, [{ key: makeOutlookCacheKey(), value: modelAnswer }])
})

test("test_getOutlook_shouldNotForwardUnknownFields_onCacheMiss", async () => {
  const { modelClientSpy, professionOutlookService } = makeSUT()

  await professionOutlookService.getOutlook({
    ...makeOutlookInput(),
    unknownField: "ignored"
  })

  assert.deepEqual(modelClientSpy.generateCalls, [{
    canonicalProfession: "software engineer",
    locale: "en-US",
    promptVersion: "prompt-v1",
    schemaVersion: "1"
  }])
})

test("test_getOutlook_shouldTreatNullCacheReadAsMiss_onCacheRead", async () => {
  const { modelClientSpy, professionOutlookService } = makeSUT({ cacheReadResult: null })

  await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(modelClientSpy.generateCalls.length, 1)
})

test("test_getOutlook_shouldTreatUndefinedCacheReadAsMiss_onCacheRead", async () => {
  const { modelClientSpy, professionOutlookService } = makeSUT({ cacheReadResult: undefined })

  await professionOutlookService.getOutlook(makeOutlookInput())

  assert.deepEqual(modelClientSpy.generateCalls.length, 1)
})

function makeSUT({ cacheReadResult = null, modelAnswer = makeOutlookAnswer(), promptVersion = "prompt-v1" } = {}) {
  const outlookCacheSpy = makeOutlookCacheSpy({ readResult: cacheReadResult })
  const modelClientSpy = makeOutlookModelClientSpy(modelAnswer)

  return {
    modelClientSpy,
    outlookCacheSpy,
    professionOutlookService: createProfessionOutlookService({
      cache: outlookCacheSpy.cache,
      modelClient: modelClientSpy.modelClient,
      promptVersion
    })
  }
}

function makeOutlookCacheSpy({ readResult = null } = {}) {
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

function makeOutlookModelClientSpy(answer = makeOutlookAnswer()) {
  const generateCalls = []

  return {
    generateCalls,
    modelClient: {
      async generate(input) {
        generateCalls.push(input)
        return answer
      }
    }
  }
}

function makeOutlookInput({ hints } = {}) {
  const input = {
    canonicalProfession: "software engineer",
    locale: "en-US",
    schemaVersion: "1"
  }

  if (hints !== undefined) {
    input.hints = hints
  }

  return input
}

function makeOutlookCacheKey() {
  return "outlook:software engineer:en-US:1:prompt-v1"
}

function makeOutlookAnswer({ headline = "Automation shifts role focus." } = {}) {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "Current adoption pace"
    },
    headline,
    keyRisks: ["skills mismatch"],
    timeHorizon: {
      explanation: "Adoption remains uneven.",
      label: "3-5 years"
    },
    whatToDoNext: ["build AI workflow fluency"]
  }
}
