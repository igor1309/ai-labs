import matter from "gray-matter";

export interface ParsedFrontmatter {
  body: string;
  description?: string;
  summary?: string;
  title?: string;
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
  } catch {
    return {
      body: raw
    };
  }

  return {
    body: parsed.content,
    description: stringValue(parsed.data.description),
    summary: stringValue(parsed.data.summary),
    title: stringValue(parsed.data.title)
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
