import { parse } from "./frontmatter";

export interface SourceFile {
  content: string;
  path: string;
}

export interface SourceFolder {
  files: SourceFile[];
  path: string;
}

export interface Item {
  body: string;
  description?: string;
  id: string;
  kind: "prompt" | "skill";
  skillShape?: "resource-backed" | "standalone";
  subtitle?: string;
  title: string;
  version?: string;
}

const DESCRIPTION_PREFIX_LIMIT = 200;

export function discoverPrompts(files: SourceFile[]): Item[] {
  return files.flatMap((file) => {
    if (!isDirectPromptMarkdown(file.path)) {
      return [];
    }

    const parsed = parse(file.content);
    const item: Item = {
      body: parsed.body,
      id: file.path,
      kind: "prompt",
      title: parsed.title ?? promptFallbackTitle(file.path)
    };

    assignOptionalFields(item, parsed);
    return [item];
  });
}

export function discoverSkills(folders: SourceFolder[]): Item[] {
  return folders.flatMap((folder) => {
    const skillFile = folder.files.find((file) => {
      return file.path === `${folder.path}/SKILL.md`;
    });

    if (skillFile === undefined) {
      return [];
    }

    const parsed = parse(skillFile.content);
    const item: Item = {
      body: parsed.body,
      id: skillFile.path,
      kind: "skill",
      skillShape: folder.files.length === 1 ? "standalone" : "resource-backed",
      title: skillTitle(parsed.name, extractH1(parsed.body))
    };

    assignOptionalFields(item, parsed);
    return [item];
  });
}

interface ParsedFieldsForItem {
  description?: string;
  name?: string;
  summary?: string;
  version?: string;
}

function assignOptionalFields(item: Item, parsed: ParsedFieldsForItem): void {
  if (parsed.name !== undefined && parsed.name !== "") {
    item.subtitle = parsed.name;
  }
  const description = parsed.description ?? parsed.summary;
  if (description !== undefined && description !== "") {
    item.description = descriptionPrefix(description);
  }
  if (parsed.version !== undefined) {
    item.version = parsed.version;
  }
}

function skillTitle(name: string | undefined, h1: string | undefined): string {
  if (h1 !== undefined) {
    return h1;
  }
  if (name !== undefined && name !== "") {
    return name;
  }
  return "error: no skill name";
}

function extractH1(body: string): string | undefined {
  const match = body.match(/^#[ \t]+(.+?)[ \t]*$/m);
  return match?.[1];
}

function descriptionPrefix(value: string): string {
  if (value.length <= DESCRIPTION_PREFIX_LIMIT) {
    return value;
  }

  return `${value.slice(0, DESCRIPTION_PREFIX_LIMIT).trimEnd()}…`;
}

function isDirectPromptMarkdown(path: string): boolean {
  return /^prompts\/[^/]+\.md$/.test(path);
}

function promptFallbackTitle(path: string): string {
  return path.slice("prompts/".length, -".md".length);
}
