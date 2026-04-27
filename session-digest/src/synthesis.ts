import { serializeModelContext, type ModelContext } from "./ledger.js";
import { SECTION_NAMES, type SectionName } from "./sections.js";

export type DigestModel = {
  invoke(input: unknown): Promise<unknown>;
};

export class SynthesisError extends Error {}

export async function synthesizeDigest(
  { model, modelContext }: { model: DigestModel; modelContext: ModelContext },
): Promise<Record<SectionName, string>> {
  const serializedContext = serializeModelContext(modelContext);
  const result = await model.invoke(synthesisPrompt(serializedContext));

  return requireCompleteSections(parseSectionsEnvelope(contentFromModelResult(result)).sections);
}

function synthesisPrompt(serializedContext: string): string {
  return [
    "Create a session digest from this bounded model context.",
    "Return JSON with a top-level sections object and exactly the documented section names.",
    "Use evidence anchors such as record:1 where relevant.",
    "",
    serializedContext,
  ].join("\n");
}

function parseSectionsEnvelope(content: string): { sections: Record<string, unknown> } {
  const parsed = parseJsonOutput(content);

  if (!isRecord(parsed) || !isRecord(parsed.sections)) {
    throw new SynthesisError("Synthesis output did not include sections.");
  }

  return { sections: parsed.sections };
}

function parseJsonOutput(content: string): unknown {
  const candidates = [
    content,
    fencedJsonContent(content),
    firstJsonObjectContent(content),
  ].filter((value): value is string => value !== undefined);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new SynthesisError("Synthesis output was not valid JSON.");
}

function requireCompleteSections(sections: Record<string, unknown>): Record<SectionName, string> {
  const completeSections: Partial<Record<SectionName, string>> = {};

  for (const sectionName of SECTION_NAMES) {
    const sectionBody = sections[sectionName];
    completeSections[sectionName] = typeof sectionBody === "string" && sectionBody.trim() !== ""
      ? sectionBody
      : "Not generated.";
  }

  return completeSections as Record<SectionName, string>;
}

function contentFromModelResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (!isRecord(result)) {
    return "";
  }

  if (typeof result.content === "string") {
    return result.content;
  }

  if (Array.isArray(result.content)) {
    return result.content.map(($0) => {
      if (typeof $0 === "string") {
        return $0;
      }

      if (isRecord($0) && typeof $0.text === "string") {
        return $0.text;
      }

      return "";
    }).join("");
  }

  return "";
}

function fencedJsonContent(content: string): string | undefined {
  const match = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(content);

  return match?.[1];
}

function firstJsonObjectContent(content: string): string | undefined {
  const start = content.indexOf("{");

  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < content.length; index += 1) {
    const character = content[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (character === "\\") {
      isEscaped = inString;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
