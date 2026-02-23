import assert from "node:assert/strict"
import test from "node:test"

test("test_resolveEffectiveLocale_shouldReturnRu_onSchemaVersion2AndRawLocaleRu", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "ru", schemaVersion: "2" })

  assert.equal(result, "ru")
})

test("test_resolveEffectiveLocale_shouldReturnRu_onSchemaVersion2AndRawLocaleRuRu", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "ru-RU", schemaVersion: "2" })

  assert.equal(result, "ru")
})

test("test_resolveEffectiveLocale_shouldReturnRu_onSchemaVersion2AndRawLocaleRuUaWithUnderscore", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "ru_UA", schemaVersion: "2" })

  assert.equal(result, "ru")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onSchemaVersion2AndRawLocaleEnUs", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "en-US", schemaVersion: "2" })

  assert.equal(result, "en")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onSchemaVersion2AndRawLocaleUnsupportedLocale", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "fr-FR", schemaVersion: "2" })

  assert.equal(result, "en")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onSchemaVersion2AndEmptyRawLocale", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "   ", schemaVersion: "2" })

  assert.equal(result, "en")
})

test("test_resolveEffectiveLocale_shouldReturnTrimmedRawLocale_onSchemaVersion1AndPaddedLocale", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "  en-US  ", schemaVersion: "1" })

  assert.equal(result, "en-US")
})

test("test_resolveEffectiveLocale_shouldReturnTrimmedRawLocaleWithoutNormalization_onSchemaVersion1AndUnderscoreLocale", async () => {
  const module = await loadEffectiveLocaleModule()

  const result = module?.resolveEffectiveLocale?.({ rawLocale: "  ru_UA  ", schemaVersion: "1" })

  assert.equal(result, "ru_UA")
})

async function loadEffectiveLocaleModule() {
  try {
    return await import("../src/effective-locale.js")
  } catch {
    return null
  }
}
