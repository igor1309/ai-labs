import { mkdir, readFile, writeFile } from "node:fs/promises"

const messagesEnPath = new URL("../../../copy/backend/messages_en.json", import.meta.url)
const messagesRuPath = new URL("../../../copy/backend/messages_ru.json", import.meta.url)
const normalizerPromptEnPath = new URL("../../../prompts/normalizer/system_prompt_en.md", import.meta.url)
const normalizerPromptRuPath = new URL("../../../prompts/normalizer/system_prompt_ru.md", import.meta.url)
const outlookPromptEnPath = new URL("../../../prompts/outlook/system_prompt_en.md", import.meta.url)
const outlookPromptRuPath = new URL("../../../prompts/outlook/system_prompt_ru.md", import.meta.url)
const outputPath = new URL("../src/generated/localized-resources.generated.js", import.meta.url)
const outputDirPath = new URL("../src/generated/", import.meta.url)

const [
  messagesEn,
  messagesRu,
  normalizerPromptEn,
  normalizerPromptRu,
  outlookPromptEn,
  outlookPromptRu
] = await Promise.all([
  readJson(messagesEnPath),
  readJson(messagesRuPath),
  readText(normalizerPromptEnPath),
  readText(normalizerPromptRuPath),
  readText(outlookPromptEnPath),
  readText(outlookPromptRuPath)
])

await mkdir(outputDirPath, { recursive: true })
await writeFile(outputPath, renderModule({
  messagesEn,
  messagesRu,
  normalizerPromptEn,
  normalizerPromptRu,
  outlookPromptEn,
  outlookPromptRu
}), "utf8")

function renderModule({
  messagesEn,
  messagesRu,
  normalizerPromptEn,
  normalizerPromptRu,
  outlookPromptEn,
  outlookPromptRu
}) {
  const backendMessages = JSON.stringify({
    en: messagesEn,
    ru: messagesRu
  }, null, 2)
  const systemPrompts = JSON.stringify({
    normalizer: {
      en: normalizerPromptEn,
      ru: normalizerPromptRu
    },
    outlook: {
      en: outlookPromptEn,
      ru: outlookPromptRu
    }
  }, null, 2)

  return [
    "// This file is generated. Do not edit by hand.",
    "// Run: node oracle/packages/worker-api/scripts/generate-localized-resources.js",
    "",
    `export const backendMessages = ${backendMessages}`,
    "",
    `export const systemPrompts = ${systemPrompts}`,
    ""
  ].join("\n")
}

async function readJson(path) {
  const content = await readFile(path, "utf8")
  return JSON.parse(content)
}

async function readText(path) {
  return await readFile(path, "utf8")
}
