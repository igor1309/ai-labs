import { assembleSections } from "./assemble";
import { isAuthorized, type Env } from "./auth";
import { discoverPrompts, discoverSkills, type SourceFile, type SourceFolder } from "./discovery";
import { createGithubClient, GithubSourceMissingError } from "./github";
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
    const skillEntries = await github.listDir("dev-skills/public");
    const skillFolders = await Promise.all(
      skillEntries
        .filter((entry) => entry.type === "dir")
        .map(async (entry): Promise<SourceFolder> => {
          const files = await github.listDir(entry.path);
          const sourceFiles = await Promise.all(
            files
              .filter((file) => file.type === "file")
              .map(async (file): Promise<SourceFile> => {
                return {
                  content: file.path.endsWith("/SKILL.md") ? await github.readFile(file.path) : "",
                  path: file.path
                };
              })
          );

          return {
            files: sourceFiles,
            path: entry.path
          };
        })
    );

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
