import assert from "node:assert/strict"
import test from "node:test"

test("test_validate_shouldReturnInvalidResult_onNonObjectInput", async () => {
  const requestGuardModule = await loadRequestGuardModule()

  const result = await requestGuardModule?.requestGuard?.validate?.("not-an-object")

  assert.deepEqual(result, {
    clarification: {
      message: "Please provide a valid profession and locale.",
      suggestions: []
    },
    isValid: false,
    schemaVersion: "1"
  })
})

async function loadRequestGuardModule() {
  try {
    return await import("../src/request-guard.js")
  } catch {
    return null
  }
}
