export interface GithubDirectoryEntry {
  path: string;
  type: "dir" | "file";
}

export interface GithubTreeEntry {
  path: string;
  type: "blob" | "tree";
}

export interface GithubClient {
  listRecursiveTree(path: string): Promise<GithubTreeEntry[]>;
  listDir(path: string): Promise<GithubDirectoryEntry[]>;
  readFile(path: string): Promise<string>;
}

export class GithubSourceMissingError extends Error {
  constructor(readonly path: string) {
    super(`GitHub source missing: ${path}`);
  }
}

export class GithubUpstreamError extends Error {}

export function createGithubClient(token: string): GithubClient {
  return {
    async listRecursiveTree(path: string): Promise<GithubTreeEntry[]> {
      const response = await fetch(githubTreeUrl(path), {
        headers: githubHeaders(token)
      });

      if (response.status === 404) {
        throw new GithubSourceMissingError(path);
      }

      if (!response.ok) {
        throw new GithubUpstreamError();
      }

      const body = await response.json() as { tree?: GithubTreeEntry[] };

      return Array.isArray(body.tree) ? body.tree : [];
    },
    async listDir(path: string): Promise<GithubDirectoryEntry[]> {
      const response = await fetch(githubContentsUrl(path), {
        headers: githubHeaders(token)
      });

      if (response.status === 404) {
        throw new GithubSourceMissingError(path);
      }

      if (!response.ok) {
        throw new GithubUpstreamError();
      }

      const body = await response.json();

      return Array.isArray(body) ? body as GithubDirectoryEntry[] : [];
    },
    async readFile(path: string): Promise<string> {
      const response = await fetch(githubContentsUrl(path), {
        headers: githubHeaders(token)
      });

      if (!response.ok) {
        throw new GithubUpstreamError();
      }

      const body = await response.json() as { content?: string; encoding?: string };

      if (body.encoding !== "base64" || body.content === undefined) {
        return "";
      }

      return decodeBase64Utf8(body.content);
    }
  };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "clipdeck",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function decodeBase64Utf8(content: string): string {
  const binary = atob(content.replaceAll("\n", ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder("utf-8").decode(bytes);
}

function githubContentsUrl(path: string): string {
  return `https://api.github.com/repos/igor1309/ai-labs/contents/${path}?ref=trunk`;
}

function githubTreeUrl(path: string): string {
  return `https://api.github.com/repos/igor1309/ai-labs/git/trees/trunk:${path}?recursive=1`;
}
