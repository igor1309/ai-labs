import { assembleSections } from "./assemble";
import type { Env } from "./auth";
import { createItemCache, isPointerFresh, type ItemCache } from "./cache";
import { discoverPrompts, discoverSkills } from "./discovery";
import { createGithubClient, type GithubClient, GithubSourceMissingError } from "./github";
import { json } from "./response";

export async function handleItems(request: Request, env: Env): Promise<Response> {
  const github = createGithubClient(env.GITHUB_TOKEN);
  const cache = createItemCache();

  try {
    const body = await loadBody(github, cache);
    return await respondWith(body, request);
  } catch (error) {
    return githubErrorResponse(error);
  }
}

async function loadBody(github: GithubClient, cache: ItemCache): Promise<string> {
  const pointer = await cache.readPointer();

  if (pointer !== undefined && isPointerFresh(pointer, Date.now())) {
    const cached = await cache.readBody(pointer.sha);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (pointer !== undefined) {
    const currentSha = await github.fetchSha();
    if (currentSha === pointer.sha) {
      const cached = await cache.readBody(pointer.sha);
      if (cached !== undefined) {
        await cache.writePointer(pointer.sha);
        return cached;
      }
    }
  }

  const sources = await github.fetchAll();
  const body = JSON.stringify({
    sections: assembleSections(
      discoverPrompts(sources.prompts),
      discoverSkills(sources.skills)
    )
  });

  await cache.writeBody(sources.sha, body);
  await cache.writePointer(sources.sha);
  return body;
}

async function respondWith(body: string, request: Request): Promise<Response> {
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
