import { assembleSections } from "./assemble";
import { isAuthorized, type Env } from "./auth";
import { discoverPrompts, discoverSkills, type SourceFile, type SourceFolder } from "./discovery";
import { createGithubClient, GithubSourceMissingError, type GithubTreeEntry } from "./github";
import { json, unauthorized } from "./response";

export async function handleItems(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return unauthorized();
  }

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

    return json({
      sections: assembleSections(
        discoverPrompts(promptFiles),
        discoverSkills(skillFolders)
      )
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
