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
  id: string;
  kind: "prompt" | "skill";
  skillShape?: "resource-backed" | "standalone";
  subtitle: string;
  title: string;
  version?: string;
}

const SUBTITLE_PREFIX_LIMIT = 200;

export function discoverPrompts(files: SourceFile[]): Item[] {
  return files.flatMap((file) => {
    if (!isDirectPromptMarkdown(file.path)) {
      return [];
    }

    const parsed = parse(file.content);

    return [
      {
        body: parsed.body,
        id: file.path,
        kind: "prompt",
        subtitle: subtitlePrefix(parsed.description ?? parsed.summary ?? ""),
        title: parsed.title ?? promptFallbackTitle(file.path)
      }
    ];
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
      subtitle: subtitlePrefix(parsed.description ?? parsed.summary ?? ""),
      title: skillTitle(parsed.name, extractH1(parsed.body))
    };

    if (parsed.version !== undefined) {
      item.version = parsed.version;
    }

    return [item];
  });
}

function skillTitle(name: string | undefined, h1: string | undefined): string {
  if (name === undefined || name === "") {
    return "error: no skill name";
  }

  if (h1 === undefined) {
    return name;
  }

  return `${h1} (${name})`;
}

function extractH1(body: string): string | undefined {
  const match = body.match(/^#[ \t]+(.+?)[ \t]*$/m);
  return match?.[1];
}

function subtitlePrefix(value: string): string {
  if (value.length <= SUBTITLE_PREFIX_LIMIT) {
    return value;
  }

  return `${value.slice(0, SUBTITLE_PREFIX_LIMIT).trimEnd()}…`;
}

function isDirectPromptMarkdown(path: string): boolean {
  return /^prompts\/[^/]+\.md$/.test(path);
}

function promptFallbackTitle(path: string): string {
  return path.slice("prompts/".length, -".md".length);
}
