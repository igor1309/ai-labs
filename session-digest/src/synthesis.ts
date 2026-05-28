import { serializeModelContext, type ModelContext } from "./ledger.js";
import { DEFAULT_DIGEST_SCHEMA, type DigestSchema } from "./sections.js";

export type DigestModel = {
  invoke(input: unknown): Promise<unknown>;
};

export class SynthesisError extends Error {}

export async function synthesizeDigest(
  { model, modelContext, schema = DEFAULT_DIGEST_SCHEMA }: {
    model: DigestModel;
    modelContext: ModelContext;
    schema?: DigestSchema;
  },
): Promise<Record<string, string>> {
  const serializedContext = serializeModelContext(modelContext);
  const result = await model.invoke(synthesisPrompt(serializedContext, schema));

  return requireCompleteSections(parseSectionsEnvelope(contentFromModelResult(result)).sections, schema);
}

function synthesisPrompt(serializedContext: string, schema: DigestSchema): string {
  return [
    "Create a session digest from this bounded model context.",
    "Return only JSON matching this exact schema:",
    sectionSchemaPrompt(schema),
    "Every section value must be a non-empty string.",
    "Do not add, omit, or rename section keys.",
    "Use evidence anchors such as record:1 where relevant.",
    "",
    serializedContext,
  ].join("\n");
}

function sectionSchemaPrompt(schema: DigestSchema): string {
  return JSON.stringify({
    sections: Object.fromEntries(schema.sections.map(($0) => [
      $0.id,
      `non-empty string; markdown heading: ${$0.heading}; ${$0.description}`,
    ])),
  }, null, 2);
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

function requireCompleteSections(sections: Record<string, unknown>, schema: DigestSchema): Record<string, string> {
  const completeSections: Record<string, string> = {};

  for (const section of schema.sections) {
    const sectionBody = sections[section.id];

    if (sectionBody === undefined) {
      throw new SynthesisError(`Missing digest section: ${section.heading}`);
    }

    if (typeof sectionBody !== "string" || sectionBody.trim() === "") {
      throw new SynthesisError(`Blank digest section: ${section.heading}`);
    }

    completeSections[section.id] = sectionBody;
  }

  for (const sectionName of Object.keys(sections)) {
    if (!isSectionName(sectionName, schema)) {
      throw new SynthesisError(`Unknown digest section: ${sectionName}`);
    }
  }

  return completeSections;
}

function isSectionName(value: string, schema: DigestSchema): boolean {
  return schema.sections.some(($0) => $0.id === value);
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
