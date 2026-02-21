import assert from "node:assert/strict"
import test from "node:test"

test("test_createRawInputCountersStore_shouldThrowMissingDependencyError_onMissingDb", async () => {
  const module = await loadStoreModule()

  assert.throws(() => module?.createRawInputCountersStore?.(), {
    message: "Missing required dependency: db"
  })
})

test("test_createRawInputCountersStore_shouldThrowInvalidDependencyError_onDbWithoutPrepareMethod", async () => {
  const module = await loadStoreModule()

  assert.throws(() => module?.createRawInputCountersStore?.({ db: {} }), {
    message: "Invalid dependency: db.prepare"
  })
})

test("test_increment_shouldUseUpsertStatement_onIncrement", async () => {
  const module = await loadStoreModule()
  const dbSpy = makeD1DatabaseSpy()
  const rawInputCountersStore = module?.createRawInputCountersStore?.({
    db: dbSpy.db,
    now: () => "2026-02-21T00:00:00.000Z"
  })

  await rawInputCountersStore?.increment("software developer")

  assert.equal(dbSpy.prepareCalls.length, 1)
  assert.match(normalizeWhitespace(dbSpy.prepareCalls[0]), /insert into raw_input_counters/i)
  assert.match(normalizeWhitespace(dbSpy.prepareCalls[0]), /on conflict\s*\(\s*raw_profession_key\s*\)\s*do update/i)
  assert.deepEqual(dbSpy.bindCalls, [["software developer", "2026-02-21T00:00:00.000Z"]])
})

test("test_increment_shouldThrowError_onEmptyRawProfessionKeyAfterTrimming", async () => {
  const module = await loadStoreModule()
  const dbSpy = makeD1DatabaseSpy()
  const rawInputCountersStore = module?.createRawInputCountersStore?.({
    db: dbSpy.db,
    now: () => "2026-02-21T00:00:00.000Z"
  })

  await assert.rejects(() => rawInputCountersStore?.increment("   "), {
    message: "rawProfessionKey must not be empty"
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
    return await import("../src/raw-input-counters-store.js")
  } catch {
    return null
  }
}
