import assert from "node:assert/strict"
import test from "node:test"

test("test_moduleExports_shouldExposeRequestGuardWithValidateMethod_onImport", async () => {
  const module = await loadRequestGuardModule()

  assert.equal(typeof module?.requestGuard?.validate, "function")
})

test("test_validate_shouldReturnInvalidResult_onNullInput", async () => {
  const module = await loadRequestGuardModule()

  const result = await module?.requestGuard?.validate?.(null)

  assert.deepEqual(result, {
    clarification: {
      message: "Please provide a valid profession and locale.",
      suggestions: []
    },
    isValid: false,
    schemaVersion: "1"
  })
})

test("test_validate_shouldReturnInvalidResult_onArrayStringAndNumberInput", async () => {
  const module = await loadRequestGuardModule()

  const results = await Promise.all([[], "software engineer", 1].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results, [makeInvalidResult(), makeInvalidResult(), makeInvalidResult()])
})

test("test_validate_shouldReturnInvalidResult_onMissingEmptyOrNonStringProfession", async () => {
  const module = await loadRequestGuardModule()
  const results = await Promise.all([
    { locale: "en-US" },
    { locale: "en-US", profession: "   " },
    { locale: "en-US", profession: 1 }
  ].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results, [makeInvalidResult(), makeInvalidResult(), makeInvalidResult()])
})

test("test_validate_shouldReturnInvalidResult_onMissingEmptyOrNonStringLocale", async () => {
  const module = await loadRequestGuardModule()
  const results = await Promise.all([
    { profession: "software engineer" },
    { locale: "   ", profession: "software engineer" },
    { locale: 1, profession: "software engineer" }
  ].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results, [makeInvalidResult(), makeInvalidResult(), makeInvalidResult()])
})

test("test_validate_shouldReturnValidResultWithTypedValue_onValidPayloadWithExtraFields", async () => {
  const module = await loadRequestGuardModule()

  const result = await module?.requestGuard?.validate?.({
    extra: "ignored",
    locale: "en-US",
    profession: "software engineer",
    schemaVersion: "2"
  })

  assert.deepEqual(result, {
    isValid: true,
    value: {
      locale: "en-US",
      profession: "software engineer",
      schemaVersion: "2"
    }
  })
})

test("test_validate_shouldReturnTrimmedValueFields_onValidPayloadWithWhitespacePadding", async () => {
  const module = await loadRequestGuardModule()

  const result = await module?.requestGuard?.validate?.({
    locale: "  en-US  ",
    profession: "  software engineer  ",
    schemaVersion: "2"
  })

  assert.deepEqual(result, {
    isValid: true,
    value: {
      locale: "en-US",
      profession: "software engineer",
      schemaVersion: "2"
    }
  })
})

test("test_validate_shouldDefaultSchemaVersionTo1_onMissingOrInvalidSchemaVersion", async () => {
  const module = await loadRequestGuardModule()
  const results = await Promise.all([
    { locale: "en-US", profession: "software engineer" },
    { locale: "en-US", profession: "software engineer", schemaVersion: "   " },
    { locale: "en-US", profession: "software engineer", schemaVersion: 1 },
    { locale: "en-US", profession: "software engineer", schemaVersion: null }
  ].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results.map(($0) => $0?.value?.schemaVersion), ["1", "1", "1", "1"])
})

test("test_validate_shouldUseProvidedSchemaVersion_onInvalidPayloadWithNonEmptySchemaVersion", async () => {
  const module = await loadRequestGuardModule()

  const result = await module?.requestGuard?.validate?.({
    locale: "en-US",
    profession: "   ",
    schemaVersion: "2"
  })

  assert.equal(result?.schemaVersion, "2")
})

test("test_validate_shouldNotThrow_onAnyInputShape", async () => {
  const module = await loadRequestGuardModule()
  const results = await Promise.allSettled([
    null,
    [],
    "profession",
    1,
    true,
    () => "value",
    { locale: "en-US" },
    { profession: "software engineer" },
    { locale: "en-US", profession: "software engineer" }
  ].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results.map(($0) => $0.status), ["fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled"])
})

test("test_validate_shouldNotThrow_onObjectWithThrowingGetters", async () => {
  const module = await loadRequestGuardModule()
  const results = await Promise.allSettled([
    makeThrowingGetterObject("schemaVersion"),
    makeThrowingGetterObject("profession"),
    makeThrowingGetterObject("locale")
  ].map(($0) => module?.requestGuard?.validate?.($0)))

  assert.deepEqual(results.map(($0) => $0.status), ["fulfilled", "fulfilled", "fulfilled"])
})

function makeInvalidResult() {
  return {
    clarification: {
      message: "Please provide a valid profession and locale.",
      suggestions: []
    },
    isValid: false,
    schemaVersion: "1"
  }
}

async function loadRequestGuardModule() {
  try {
    return await import("../src/request-guard.js")
  } catch {
    return null
  }
}

function makeThrowingGetterObject(field) {
  const input = {}

  Object.defineProperty(input, field, {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error("getter exploded")
    }
  })

  return input
}
