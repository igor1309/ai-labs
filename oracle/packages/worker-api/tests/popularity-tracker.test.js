import assert from "node:assert/strict"
import test from "node:test"

test("test_createPopularityTracker_shouldThrowMissingDependencyError_onMissingPopularityCountersStore", async () => {
  const module = await loadTrackerModule()

  assert.throws(() => module?.createPopularityTracker?.({
    rawInputCountersStore: makeRawInputCountersStoreSpy().store
  }), {
    message: "Missing required dependency: popularityCountersStore"
  })
})

test("test_createPopularityTracker_shouldThrowInvalidDependencyError_onPopularityCountersStoreWithoutIncrementMethod", async () => {
  const module = await loadTrackerModule()

  assert.throws(() => module?.createPopularityTracker?.({
    popularityCountersStore: {},
    rawInputCountersStore: makeRawInputCountersStoreSpy().store
  }), {
    message: "Invalid dependency: popularityCountersStore.increment"
  })
})

test("test_createPopularityTracker_shouldThrowMissingDependencyError_onMissingRawInputCountersStore", async () => {
  const module = await loadTrackerModule()

  assert.throws(() => module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store
  }), {
    message: "Missing required dependency: rawInputCountersStore"
  })
})

test("test_createPopularityTracker_shouldThrowInvalidDependencyError_onRawInputCountersStoreWithoutIncrementMethod", async () => {
  const module = await loadTrackerModule()

  assert.throws(() => module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    rawInputCountersStore: {}
  }), {
    message: "Invalid dependency: rawInputCountersStore.increment"
  })
})

test("test_track_shouldIncrementRawAndCanonicalCounters_onCanonicalResult", async () => {
  const module = await loadTrackerModule()
  const popularityCountersStoreSpy = makePopularityCountersStoreSpy()
  const rawInputCountersStoreSpy = makeRawInputCountersStoreSpy()
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: popularityCountersStoreSpy.store,
    rawInputCountersStore: rawInputCountersStoreSpy.store
  })

  await tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "software engineer",
      needsClarification: false
    },
    rawProfession: "  software   developer  "
  })

  assert.deepEqual(rawInputCountersStoreSpy.calls, ["software developer"])
  assert.deepEqual(popularityCountersStoreSpy.calls, ["software engineer"])
})

test("test_track_shouldIncrementOnlyRawInputCounter_onClarificationResult", async () => {
  const module = await loadTrackerModule()
  const popularityCountersStoreSpy = makePopularityCountersStoreSpy()
  const rawInputCountersStoreSpy = makeRawInputCountersStoreSpy()
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: popularityCountersStoreSpy.store,
    rawInputCountersStore: rawInputCountersStoreSpy.store
  })

  await tracker?.track?.({
    normalizerResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    },
    rawProfession: "  software   developer  "
  })

  assert.deepEqual(rawInputCountersStoreSpy.calls, ["software developer"])
  assert.deepEqual(popularityCountersStoreSpy.calls, [])
})

test("test_track_shouldThrowError_onEmptyRawProfessionAfterTrimmingAndCollapsingWhitespace", async () => {
  const module = await loadTrackerModule()
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    rawInputCountersStore: makeRawInputCountersStoreSpy().store
  })

  await assert.rejects(() => tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "software engineer",
      needsClarification: false
    },
    rawProfession: "   "
  }), {
    message: "rawProfession must not be empty"
  })
})

test("test_track_shouldThrowError_onEmptyCanonicalProfessionAfterTrimming_onCanonicalResult", async () => {
  const module = await loadTrackerModule()
  const rawInputCountersStoreSpy = makeRawInputCountersStoreSpy()
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    rawInputCountersStore: rawInputCountersStoreSpy.store
  })

  await assert.rejects(() => tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "   ",
      needsClarification: false
    },
    rawProfession: "software developer"
  }), {
    message: "canonicalProfession must not be empty"
  })
  assert.deepEqual(rawInputCountersStoreSpy.calls, ["software developer"])
})

test("test_track_shouldPropagateError_onRawInputStoreFailure", async () => {
  const module = await loadTrackerModule()
  const expectedError = new Error("raw counter failed")
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    rawInputCountersStore: makeRawInputCountersStoreSpy(expectedError).store
  })

  await assert.rejects(() => tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "software engineer",
      needsClarification: false
    },
    rawProfession: "software developer"
  }), expectedError)
  assert.equal(expectedError.counterWriteFailed, true)
})

test("test_track_shouldPropagateError_onPopularityStoreFailure", async () => {
  const module = await loadTrackerModule()
  const expectedError = new Error("canonical counter failed")
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy(expectedError).store,
    rawInputCountersStore: makeRawInputCountersStoreSpy().store
  })

  await assert.rejects(() => tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "software engineer",
      needsClarification: false
    },
    rawProfession: "software developer"
  }), expectedError)
  assert.equal(expectedError.counterWriteFailed, true)
})

test("test_track_shouldWrapErrorWithCounterWriteFailure_onFrozenStoreError", async () => {
  const module = await loadTrackerModule()
  const frozenError = Object.freeze(new Error("frozen raw counter failed"))
  const tracker = module?.createPopularityTracker?.({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    rawInputCountersStore: makeRawInputCountersStoreSpy(frozenError).store
  })

  await assert.rejects(() => tracker?.track?.({
    normalizerResult: {
      canonicalProfession: "software engineer",
      needsClarification: false
    },
    rawProfession: "software developer"
  }), (error) => error?.counterWriteFailed === true && error?.cause === frozenError)
})

function makePopularityCountersStoreSpy(error) {
  const calls = []

  return {
    calls,
    store: {
      async increment(canonicalProfession) {
        if (error) {
          throw error
        }

        calls.push(canonicalProfession)
      }
    }
  }
}

function makeRawInputCountersStoreSpy(error) {
  const calls = []

  return {
    calls,
    store: {
      async increment(rawProfessionKey) {
        if (error) {
          throw error
        }

        calls.push(rawProfessionKey)
      }
    }
  }
}

async function loadTrackerModule() {
  try {
    return await import("../src/popularity-tracker.js")
  } catch {
    return null
  }
}
