import assert from "node:assert/strict"
import test from "node:test"

test("test_moduleExports_shouldExposeRenderCloudInit_onImport", async () => {
  const module = await loadGenerateCloudInitModule()

  assert.equal(typeof module?.renderCloudInit, "function")
})

async function loadGenerateCloudInitModule() {
  try {
    return await import("../scripts/phase1/generate-cloud-init.js")
  } catch {
    return null
  }
}
