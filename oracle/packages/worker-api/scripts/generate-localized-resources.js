import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const messagesEnPath = new URL("../../../copy/backend/messages_en.json", import.meta.url)
const messagesRuPath = new URL("../../../copy/backend/messages_ru.json", import.meta.url)
const outputPath = new URL("../src/generated/localized-resources.generated.js", import.meta.url)
const outputDirPath = new URL("../src/generated/", import.meta.url)

const [messagesEn, messagesRu] = await Promise.all([
  readJson(messagesEnPath),
  readJson(messagesRuPath)
])

await mkdir(outputDirPath, { recursive: true })
await writeFile(outputPath, renderModule({ messagesEn, messagesRu }), "utf8")

function renderModule({ messagesEn, messagesRu }) {
  const content = JSON.stringify({
    en: messagesEn,
    ru: messagesRu
  }, null, 2)

  return [
    "// This file is generated. Do not edit by hand.",
    `// Run: node ${fileURLToPath(new URL("./generate-localized-resources.js", import.meta.url))}`,
    "",
    `export const backendMessages = ${content}`,
    ""
  ].join("\n")
}

async function readJson(path) {
  const content = await readFile(path, "utf8")
  return JSON.parse(content)
}
