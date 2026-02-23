import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

test("test_stringsEn_shouldExist_onDisk", async () => {
  const strings = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_en.json"))

  assert.notEqual(strings, null)
})

test("test_stringsRu_shouldExist_onDisk", async () => {
  const strings = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_ru.json"))

  assert.notEqual(strings, null)
})

test("test_stringsEn_shouldContainAllRequiredKeys_onContract", async () => {
  const strings = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_en.json"))

  const keys = strings === null ? [] : flattenLeafKeyPaths(strings)
  const missingKeys = REQUIRED_KEY_PATHS.filter((requiredKey) => !keys.includes(requiredKey))

  assert.deepEqual(missingKeys, [])
})

test("test_stringsRu_shouldMatchEnglishKeySet_onContract", async () => {
  const stringsEn = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_en.json"))
  const stringsRu = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_ru.json"))

  const keysEn = stringsEn === null ? [] : flattenLeafKeyPaths(stringsEn).sort()
  const keysRu = stringsRu === null ? [] : flattenLeafKeyPaths(stringsRu).sort()

  assert.deepEqual(keysRu, keysEn)
})

test("test_generatedStringsModule_shouldExist_onContract", async () => {
  const module = await loadGeneratedStringsModuleOrNull()

  assert.notEqual(module, null)
})

test("test_generatedStringsModule_shouldMatchEnglishJson_onContract", async () => {
  const module = await loadGeneratedStringsModuleOrNull()
  const strings = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_en.json"))

  assert.deepEqual(module?.stringsByLocale?.en, strings)
})

test("test_generatedStringsModule_shouldMatchRussianJson_onContract", async () => {
  const module = await loadGeneratedStringsModuleOrNull()
  const strings = await readJsonOrNull(path.join(currentDirectory, "../src/i18n/strings_ru.json"))

  assert.deepEqual(module?.stringsByLocale?.ru, strings)
})

test("test_generateWebStringsScript_shouldExist_onContract", async () => {
  const script = await readFileOrNull(path.join(currentDirectory, "../scripts/generate_web_strings.mjs"))

  assert.notEqual(script, null)
})

async function readJsonOrNull(filePath) {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readFileOrNull(filePath) {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}

async function loadGeneratedStringsModuleOrNull() {
  try {
    return await import("../src/generated/strings.generated.js")
  } catch {
    return null
  }
}

function flattenLeafKeyPaths(value, prefix = "") {
  if (value === null || typeof value !== "object") {
    return []
  }

  return Object.entries(value).flatMap(([key, entryValue]) => {
    const entryPath = prefix === "" ? key : `${prefix}.${key}`

    if (entryValue !== null && typeof entryValue === "object") {
      return flattenLeafKeyPaths(entryValue, entryPath)
    }

    return [entryPath]
  })
}

const REQUIRED_KEY_PATHS = [
  "confidenceLabels.high",
  "confidenceLabels.low",
  "confidenceLabels.medium",
  "documentTitle",
  "form.professionLabel",
  "form.professionPlaceholder",
  "form.submitButton",
  "hero.eyebrow",
  "hero.intro",
  "hero.title",
  "sections.assumptions",
  "sections.clarification",
  "sections.confidence",
  "sections.risks",
  "sections.timeHorizon",
  "sections.whatToDoNext",
  "states.loading",
  "states.transportError"
]
