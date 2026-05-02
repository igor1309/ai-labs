import matter from "gray-matter";

export interface ParsedFrontmatter {
  body: string;
  description?: string;
  name?: string;
  summary?: string;
  title?: string;
  version?: string;
}

export function parse(raw: string): ParsedFrontmatter {
  if (!hasClosingFrontmatterDelimiter(raw)) {
    return {
      body: raw
    };
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (error) {
    console.error("frontmatter parse failed", error);
    return {
      body: raw
    };
  }

  return {
    body: parsed.content,
    description: stringValue(parsed.data.description),
    name: stringValue(parsed.data.name),
    summary: stringValue(parsed.data.summary),
    title: stringValue(parsed.data.title),
    version: scalarStringValue(parsed.data.version)
  };
}

function hasClosingFrontmatterDelimiter(raw: string): boolean {
  if (!raw.startsWith("---\n")) {
    return true;
  }

  return raw.split("\n").slice(1).some((line) => line === "---");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function scalarStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}
