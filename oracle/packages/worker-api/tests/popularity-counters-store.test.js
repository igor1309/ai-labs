import assert from "node:assert/strict"
import test from "node:test"

test("test_createPopularityCountersStore_shouldThrowMissingDependencyError_onMissingDb", async () => {
  const module = await loadStoreModule()

  assert.throws(() => module?.createPopularityCountersStore?.(), {
    message: "Missing required dependency: db"
  })
})

test("test_createPopularityCountersStore_shouldThrowInvalidDependencyError_onDbWithoutPrepareMethod", async () => {
  const module = await loadStoreModule()

  assert.throws(() => module?.createPopularityCountersStore?.({ db: {} }), {
    message: "Invalid dependency: db.prepare"
  })
})

test("test_increment_shouldUseUpsertStatement_onIncrement", async () => {
  const module = await loadStoreModule()
  const dbSpy = makeD1DatabaseSpy()
  const popularityCountersStore = module?.createPopularityCountersStore?.({
    db: dbSpy.db,
    now: () => "2026-02-21T00:00:00.000Z"
  })

  await popularityCountersStore?.increment("software engineer")

  assert.equal(dbSpy.prepareCalls.length, 1)
  assert.match(normalizeWhitespace(dbSpy.prepareCalls[0]), /insert into profession_counters/i)
  assert.match(normalizeWhitespace(dbSpy.prepareCalls[0]), /on conflict\s*\(\s*canonical_profession\s*\)\s*do update/i)
  assert.deepEqual(dbSpy.bindCalls, [["software engineer", "2026-02-21T00:00:00.000Z"]])
})

test("test_increment_shouldThrowError_onEmptyCanonicalProfessionAfterTrimming", async () => {
  const module = await loadStoreModule()
  const dbSpy = makeD1DatabaseSpy()
  const popularityCountersStore = module?.createPopularityCountersStore?.({
    db: dbSpy.db,
    now: () => "2026-02-21T00:00:00.000Z"
  })

  await assert.rejects(() => popularityCountersStore?.increment("   "), {
    message: "canonicalProfession must not be empty"
  })
})

function makeD1DatabaseSpy() {
  const bindCalls = []
  const prepareCalls = []

  return {
    bindCalls,
    prepareCalls,
    db: {
      prepare(statement) {
        prepareCalls.push(statement)

        return {
          bind(...values) {
            bindCalls.push(values)

            return {
              async run() {}
            }
          }
        }
      }
    }
  }
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ")
}

async function loadStoreModule() {
  try {
    return await import("../src/popularity-counters-store.js")
  } catch {
    return null
  }
}
