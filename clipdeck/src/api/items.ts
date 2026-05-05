import { assembleSections } from "./assemble";
import type { Env } from "./auth";
import { discoverPrompts, discoverSkills } from "./discovery";
import { createGithubClient, GithubSourceMissingError } from "./github";
import { json } from "./response";

export async function handleItems(request: Request, env: Env): Promise<Response> {
  const github = createGithubClient(env.GITHUB_TOKEN);
  try {
    const sources = await github.fetchAll();

    const body = JSON.stringify({
      sections: assembleSections(
        discoverPrompts(sources.prompts),
        discoverSkills(sources.skills)
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
    return githubErrorResponse(error);
  }
}

function sourceName(path: string): "prompts" | "skills" {
  return path === "prompts" ? "prompts" : "skills";
}

function githubErrorResponse(error: unknown): Response {
  if (error instanceof GithubSourceMissingError) {
    return json({
      error: "source_missing",
      source: sourceName(error.path)
    }, 502);
  }

  return json({
    error: "upstream_github_failure",
    source: "skills"
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
