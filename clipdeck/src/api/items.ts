import { assembleSections } from "./assemble";
import type { Env } from "./auth";
import { discoverPrompts, discoverSkills, type SourceFile, type SourceFolder } from "./discovery";
import { createGithubClient, GithubSourceMissingError, type GithubTreeEntry } from "./github";
import { json } from "./response";

export async function handleItems(request: Request, env: Env): Promise<Response> {
  const github = createGithubClient(env.GITHUB_TOKEN);
  let activeSource: "prompts" | "skills" = "prompts";
  try {
    const promptEntries = await github.listDir("prompts");
    const promptFiles = await Promise.all(
      promptEntries
        .filter((entry) => entry.type === "file")
        .map(async (entry): Promise<SourceFile> => {
          return {
            content: await github.readFile(entry.path),
            path: entry.path
          };
        })
    );

    activeSource = "skills";
    const skillTree = await github.listRecursiveTree("dev-skills/public");
    const skillFolders = await buildSkillFolders(skillTree, github.readFile);

    const body = JSON.stringify({
      sections: assembleSections(
        discoverPrompts(promptFiles),
        discoverSkills(skillFolders)
      )
    });
    const etag = await representationETag(body);
    const headers = itemHeaders(etag);

    if (matchesETag(request.headers.get("If-None-Match"), etag)) {
      return new Response(null, {
        headers,
        status: 304
      });
    }

    return new Response(body, {
      headers,
      status: 200
    });
  } catch (error) {
    return githubErrorResponse(error, activeSource);
  }
}

async function buildSkillFolders(
  tree: GithubTreeEntry[],
  readFile: (path: string) => Promise<string>
): Promise<SourceFolder[]> {
  const filesByFolder = new Map<string, SourceFile[]>();

  for (const entry of tree) {
    const folderPath = skillFolderPath(entry.path);
    if (folderPath === undefined) {
      continue;
    }

    const files = filesByFolder.get(folderPath) ?? [];
    files.push({
      content: entry.path.endsWith("/SKILL.md")
        ? await readFile(`dev-skills/public/${entry.path}`)
        : "",
      path: `dev-skills/public/${entry.path}`
    });
    filesByFolder.set(folderPath, files);
  }

  return Array.from(filesByFolder, ([path, files]) => {
    return {
      files,
      path
    };
  });
}

function skillFolderPath(path: string): string | undefined {
  const [folder] = path.split("/");
  if (folder === undefined || folder === "") {
    return undefined;
  }

  return `dev-skills/public/${folder}`;
}

function sourceName(path: string): "prompts" | "skills" {
  return path === "prompts" ? "prompts" : "skills";
}

function githubErrorResponse(error: unknown, activeSource: "prompts" | "skills"): Response {
  if (error instanceof GithubSourceMissingError) {
    return json({
      error: "source_missing",
      source: sourceName(error.path)
    }, 502);
  }

  return json({
    error: "upstream_github_failure",
    source: activeSource
  }, 502);
}

function itemHeaders(etag: string): HeadersInit {
  return {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    ETag: etag
  };
}

function matchesETag(ifNoneMatch: string | null, etag: string): boolean {
  return ifNoneMatch?.split(",").some((value) => {
    const validator = value.trim();

    return validator === "*" || weakETagValue(validator) === weakETagValue(etag);
  }) ?? false;
}

async function representationETag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), (byte) => {
    return byte.toString(16).padStart(2, "0");
  }).join("");

  return `"${hex}"`;
}

function weakETagValue(etag: string): string {
  return etag.startsWith("W/") ? etag.slice("W/".length) : etag;
}
