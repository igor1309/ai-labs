import type { SourceFile, SourceFolder } from "./discovery";

export interface BulkSources {
  prompts: SourceFile[];
  sha: string;
  skills: SourceFolder[];
}

export interface GithubClient {
  fetchAll(): Promise<BulkSources>;
}

export class GithubSourceMissingError extends Error {
  constructor(readonly path: string) {
    super(`GitHub source missing: ${path}`);
  }
}

export class GithubUpstreamError extends Error {}

interface GraphqlBlob {
  isBinary: boolean | null;
  text: string | null;
}

interface GraphqlEntry {
  name: string;
  object: GraphqlObject | null;
  type: string;
}

interface GraphqlTree {
  entries: GraphqlEntry[] | null;
}

type GraphqlObject = GraphqlBlob | GraphqlTree | Record<string, never>;

interface GraphqlResponse {
  data?: {
    repository?: {
      prompts: GraphqlObject | null;
      ref: { target: { oid: string } | null } | null;
      skills: GraphqlObject | null;
    } | null;
  };
  errors?: unknown;
}

export function createGithubClient(token: string): GithubClient {
  return {
    async fetchAll(): Promise<BulkSources> {
      const response = await fetch("https://api.github.com/graphql", {
        body: JSON.stringify({ query: BULK_QUERY }),
        headers: githubHeaders(token),
        method: "POST"
      });

      if (!response.ok) {
        throw new GithubUpstreamError();
      }

      const body = await response.json() as GraphqlResponse;
      if (body.errors !== undefined || body.data?.repository === undefined || body.data.repository === null) {
        throw new GithubUpstreamError();
      }

      const repository = body.data.repository;
      const sha = repository.ref?.target?.oid;
      if (typeof sha !== "string" || sha === "") {
        throw new GithubUpstreamError();
      }

      const prompts = repository.prompts;
      if (prompts === null) {
        throw new GithubSourceMissingError("prompts");
      }
      const skills = repository.skills;
      if (skills === null) {
        throw new GithubSourceMissingError("dev-skills/public");
      }

      return {
        prompts: collectPromptFiles(prompts),
        sha,
        skills: collectSkillFolders(skills)
      };
    }
  };
}

const BULK_QUERY = `
query {
  repository(owner: "igor1309", name: "ai-labs") {
    ref(qualifiedName: "refs/heads/trunk") {
      target { ... on Commit { oid } }
    }
    prompts: object(expression: "trunk:prompts") {
      ... on Tree {
        entries {
          name
          type
          object { ... on Blob { text isBinary } }
        }
      }
    }
    skills: object(expression: "trunk:dev-skills/public") {
      ... on Tree {
        entries {
          name
          type
          object {
            ... on Tree {
              entries {
                name
                type
                object { ... on Blob { text isBinary } }
              }
            }
          }
        }
      }
    }
  }
}
`;

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "clipdeck",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function collectPromptFiles(node: GraphqlObject): SourceFile[] {
  const entries = treeEntries(node);

  return entries.flatMap((entry) => {
    if (entry.type !== "blob") {
      return [];
    }

    const blob = blobOf(entry.object);
    if (blob === undefined || blob.isBinary === true || blob.text === null) {
      return [];
    }

    return [{
      content: blob.text,
      path: `prompts/${entry.name}`
    }];
  });
}

function collectSkillFolders(node: GraphqlObject): SourceFolder[] {
  const entries = treeEntries(node);

  return entries.flatMap((entry) => {
    if (entry.type !== "tree") {
      return [];
    }

    const folderPath = `dev-skills/public/${entry.name}`;
    const innerEntries = treeEntries(entry.object);

    const files: SourceFile[] = innerEntries.map((inner) => {
      const path = `${folderPath}/${inner.name}`;
      if (inner.type !== "blob") {
        return { content: "", path };
      }

      const blob = blobOf(inner.object);
      if (blob === undefined || blob.isBinary === true || blob.text === null) {
        return { content: "", path };
      }

      return { content: blob.text, path };
    });

    return [{ files, path: folderPath }];
  });
}

function treeEntries(node: GraphqlObject | null): GraphqlEntry[] {
  if (node === null) {
    return [];
  }

  const entries = (node as GraphqlTree).entries;
  return Array.isArray(entries) ? entries : [];
}

function blobOf(object: GraphqlObject | null): GraphqlBlob | undefined {
  if (object === null) {
    return undefined;
  }

  const blob = object as GraphqlBlob;
  if (typeof blob.text === "string" || blob.text === null || typeof blob.isBinary === "boolean") {
    return blob;
  }

  return undefined;
}
