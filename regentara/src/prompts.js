import { readFile } from "node:fs/promises";

const PROMPT_TEMPLATE_URLS = {
  producer: new URL("./prompts/producer.md", import.meta.url),
  reviewer: new URL("./prompts/reviewer.md", import.meta.url),
  remediator: new URL("./prompts/remediator.md", import.meta.url),
};

const promptTemplateCache = new Map();

export async function buildAgentPrompt(agentId, agent, input) {
  const template = await loadPromptTemplate(agentId);

  return template
    .replaceAll("{{agentId}}", agentId)
    .replaceAll("{{promptRef}}", agent.prompt.ref)
    .replaceAll("{{taskContextJson}}", JSON.stringify(input, null, 2))
    .replaceAll("{{outputSchemaJson}}", JSON.stringify(agent.outputSchema, null, 2));
}

async function loadPromptTemplate(agentId) {
  const templateUrl = PROMPT_TEMPLATE_URLS[agentId];

  if (!templateUrl) {
    throw new Error(`prompt template not found for agent: ${agentId}`);
  }

  if (!promptTemplateCache.has(agentId)) {
    const template = await readFile(templateUrl, "utf8");
    promptTemplateCache.set(agentId, template.trimEnd());
  }

  return promptTemplateCache.get(agentId);
}
