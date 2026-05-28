import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Env } from "../src/api/auth";
import { bodyCacheKey, POINTER_URL } from "../src/api/cache";
import worker from "../src/index";

interface BlobNode {
  isBinary?: boolean;
  text: string | null;
}

interface PromptEntry {
  blob?: BlobNode;
  name: string;
  type: "blob" | "tree";
}

interface SkillFileEntry {
  blob?: BlobNode;
  name: string;
  type: "blob" | "tree";
}

interface SkillFolderEntry {
  files: SkillFileEntry[];
  name: string;
}

interface BulkPayload {
  prompts: PromptEntry[] | null;
  sha: string;
  skills: SkillFolderEntry[] | null;
}

describe("GET /api/items", () => {
  beforeEach(async () => {
    await clearItemCacheForShas([]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearItemCacheForShas([]);
  });

  test("should return empty sections when prompts and skills are empty", async () => {
    stubGraphqlOnce({
      prompts: [],
      sha: "sha-empty",
      skills: []
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      200,
      {
        sections: [
          { id: "prompts", items: [], title: "Prompts" },
          { id: "skills", items: [], title: "Skills" }
        ]
      }
    ]);
  });

  test("should send validators for item metadata revalidation", async () => {
    stubGraphqlOnce({
      prompts: [],
      sha: "sha-empty",
      skills: []
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([
      response.headers.get("Cache-Control"),
      Boolean(response.headers.get("ETag"))
    ]).toEqual([
      "no-cache",
      true
    ]);
  });

  test("should return not modified when item metadata validator matches", async () => {
    stubGraphql(() => ({ prompts: [], sha: "sha-empty", skills: [] }));

    const firstResponse = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          "If-None-Match": String(firstResponse.headers.get("ETag"))
        }
      }),
      makeEnv()
    );

    expect([response.status, await response.text()]).toEqual([304, ""]);
  });

  test("should return not modified when weak or wildcard validators match", async () => {
    stubGraphql(() => ({ prompts: [], sha: "sha-empty", skills: [] }));

    const firstResponse = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );
    const etag = String(firstResponse.headers.get("ETag"));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          "If-None-Match": `W/${etag}, *`
        }
      }),
      makeEnv()
    );

    expect(response.status).toBe(304);
  });

  test("should identify clipdeck as user agent for GitHub graphql", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      fetchCalls.push({ init, url: String(input) });
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-x", skills: [] }) });
    }));

    await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect(fetchCalls).toEqual([
      expect.objectContaining({
        init: expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "clipdeck"
          }),
          method: "POST"
        }),
        url: "https://api.github.com/graphql"
      })
    ]);
  });

  test("should issue exactly one fetch to graphql for a cold rebuild", async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      fetchCalls.push(String(input));
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-x", skills: [] }) });
    }));

    await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect(fetchCalls).toEqual(["https://api.github.com/graphql"]);
  });

  test("should not call any github contents or trees endpoint", async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      fetchCalls.push(String(input));
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-x", skills: [] }) });
    }));

    await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect(fetchCalls.some((url) => url.includes("/contents/") || url.includes("/git/trees/"))).toBe(false);
  });

  test("should restrict graphql query to allowlisted source paths", async () => {
    const queries: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      const body = init?.body;
      if (typeof body === "string") {
        const parsed = JSON.parse(body) as { query?: string };
        if (typeof parsed.query === "string") {
          queries.push(parsed.query);
        }
      }
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-x", skills: [] }) });
    }));

    await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    const query = queries[0] ?? "";
    expect([
      query.includes("trunk:prompts"),
      query.includes("trunk:dev-skills/public"),
      query.includes("trunk:.github"),
      query.includes("trunk:src")
    ]).toEqual([true, true, false, false]);
  });

  test("should return discovered prompt and skill items from graphql", async () => {
    stubGraphqlOnce({
      prompts: [
        {
          blob: { text: "---\ntitle: Foo Prompt\n---\nPrompt body\n" },
          name: "foo.md",
          type: "blob"
        },
        { name: "sub", type: "tree" }
      ],
      sha: "sha-1",
      skills: [
        {
          files: [
            {
              blob: {
                text: "---\nname: example\ndescription: Skill details\n---\n# Example Skill\n\nSkill body\n"
              },
              name: "SKILL.md",
              type: "blob"
            },
            { name: "helper.py", type: "blob" }
          ],
          name: "example"
        }
      ]
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect(await response.json()).toEqual({
      sections: [
        {
          id: "prompts",
          items: [
            {
              body: "Prompt body\n",
              description: "Prompt body",
              id: "prompts/foo.md",
              kind: "prompt",
              subtitle: "foo",
              title: "Foo Prompt"
            }
          ],
          title: "Prompts"
        },
        {
          id: "skills",
          items: [
            {
              body: "# Example Skill\n\nSkill body\n",
              description: "Skill details",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "resource-backed",
              subtitle: "example",
              title: "Example Skill"
            }
          ],
          title: "Skills"
        }
      ]
    });
  });

  test("should preserve utf8 prompt body from graphql text", async () => {
    stubGraphqlOnce({
      prompts: [
        {
          blob: { text: "---\ntitle: Foo Prompt\n---\ncafé\nпривет\n" },
          name: "foo.md",
          type: "blob"
        }
      ],
      sha: "sha-utf8",
      skills: []
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{ items: Array<{ body: string }> }>;
    };

    expect(body.sections[0]?.items.map((item) => item.body)).toEqual(["café\nпривет\n"]);
  });

  test("should mark skills with sibling directories as resource backed", async () => {
    stubGraphqlOnce({
      prompts: [],
      sha: "sha-rb",
      skills: [
        {
          files: [
            {
              blob: { text: "---\ndescription: Skill details\n---\nSkill body\n" },
              name: "SKILL.md",
              type: "blob"
            },
            { name: "references", type: "tree" }
          ],
          name: "example"
        }
      ]
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{ items: Array<{ skillShape?: string }> }>;
    };

    expect(body.sections[1]?.items.map((item) => item.skillShape)).toEqual(["resource-backed"]);
  });

  test("should ignore binary blobs returned by graphql", async () => {
    stubGraphqlOnce({
      prompts: [
        {
          blob: { isBinary: true, text: null },
          name: "logo.png",
          type: "blob"
        },
        {
          blob: { text: "---\ntitle: Foo Prompt\n---\nPrompt body\n" },
          name: "foo.md",
          type: "blob"
        }
      ],
      sha: "sha-bin",
      skills: []
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{ items: Array<{ id: string }> }>;
    };

    expect(body.sections[0]?.items.map((item) => item.id)).toEqual(["prompts/foo.md"]);
  });

  test("should return source missing when prompts source is absent", async () => {
    stubGraphqlOnce({
      prompts: null,
      sha: "sha-x",
      skills: []
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      502,
      { error: "source_missing", source: "prompts" }
    ]);
  });

  test("should return source missing when skills source is absent", async () => {
    stubGraphqlOnce({
      prompts: [],
      sha: "sha-x",
      skills: null
    });

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      502,
      { error: "source_missing", source: "skills" }
    ]);
  });

  test("should return upstream failure when graphql request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("server error", { status: 500 });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      502,
      { error: "upstream_github_failure", source: "skills" }
    ]);
  });

  test("should return upstream failure when graphql payload reports errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json({ errors: [{ message: "rate limited" }] });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      502,
      { error: "upstream_github_failure", source: "skills" }
    ]);
  });

  test("should issue zero github calls on a cache hit within freshness window", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-cache-hit", skills: [] }) });
    }));

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());
    const callsAfterFirst = calls;

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    expect([callsAfterFirst, calls]).toEqual([1, 1]);

    await clearItemCacheForShas(["sha-cache-hit"]);
  });

  test("should issue exactly one github call on expired pointer with unchanged sha", async () => {
    const calls: Array<{ query: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      const query = typeof init?.body === "string" ? (JSON.parse(init.body) as { query: string }).query : "";
      calls.push({ query });
      const isShaQuery = !query.includes("trunk:prompts");
      if (isShaQuery) {
        return Response.json({ data: { repository: { ref: { target: { oid: "sha-same" } } } } });
      }
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-same", skills: [] }) });
    }));

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());
    const callsAfterFirst = calls.length;

    await expirePointer("sha-same");

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    expect([callsAfterFirst, calls.length]).toEqual([1, 2]);

    await clearItemCacheForShas(["sha-same"]);
  });

  test("should issue exactly two github calls on expired pointer with changed sha", async () => {
    const calls: Array<{ query: string }> = [];
    let currentSha = "sha-old";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      const query = typeof init?.body === "string" ? (JSON.parse(init.body) as { query: string }).query : "";
      calls.push({ query });
      const isShaQuery = !query.includes("trunk:prompts");
      if (isShaQuery) {
        return Response.json({ data: { repository: { ref: { target: { oid: currentSha } } } } });
      }
      return Response.json({ data: graphqlData({ prompts: [], sha: currentSha, skills: [] }) });
    }));

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());
    const callsAfterFirst = calls.length;

    currentSha = "sha-new";
    await expirePointer("sha-old");

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    expect([callsAfterFirst, calls.length]).toEqual([1, 3]);

    await clearItemCacheForShas(["sha-old", "sha-new"]);
  });

  test("should return upstream failure when freshness check fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-warm", skills: [] }) });
    }));

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    await expirePointer("sha-warm");

    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("server error", { status: 500 });
    }));

    const response = await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    expect([response.status, await response.json()]).toEqual([
      502,
      { error: "upstream_github_failure", source: "skills" }
    ]);

    await clearItemCacheForShas(["sha-warm"]);
  });

  test("should write pointer with freshness timestamp at or before now", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-pointer", skills: [] }) });
    }));

    const before = Date.now();
    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());
    const after = Date.now();

    const pointer = await caches.default.match(POINTER_URL);
    const payload = pointer === undefined ? undefined : JSON.parse(await pointer.text()) as { freshAtMs?: number; sha?: string };

    expect([
      payload?.sha,
      typeof payload?.freshAtMs === "number" && payload.freshAtMs >= before && payload.freshAtMs <= after
    ]).toEqual(["sha-pointer", true]);

    await clearItemCacheForShas(["sha-pointer"]);
  });

  test("should store body cache entry under sha-bearing key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json({ data: graphqlData({ prompts: [], sha: "sha-keyed", skills: [] }) });
    }));

    await worker.fetch(new Request("https://clipdeck.example/api/items"), makeEnv());

    const cached = await caches.default.match(bodyCacheKey("sha-keyed"));

    expect(cached).toBeDefined();

    await clearItemCacheForShas(["sha-keyed"]);
  });
});

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "github-token"
  };
}

const KNOWN_TEST_SHAS = [
  "sha-empty",
  "sha-x",
  "sha-1",
  "sha-utf8",
  "sha-rb",
  "sha-bin",
  "sha-cache-hit",
  "sha-same",
  "sha-old",
  "sha-new",
  "sha-warm",
  "sha-pointer",
  "sha-keyed"
];

async function clearItemCacheForShas(extra: readonly string[]): Promise<void> {
  await caches.default.delete(POINTER_URL);
  const shas = new Set([...KNOWN_TEST_SHAS, ...extra]);
  await Promise.all(Array.from(shas, (sha) => caches.default.delete(bodyCacheKey(sha))));
}

async function expirePointer(sha: string): Promise<void> {
  const expired = JSON.stringify({ freshAtMs: 0, sha });
  await caches.default.put(POINTER_URL, new Response(expired, {
    headers: {
      "Cache-Control": "public, max-age=31536000",
      "Content-Type": "application/json"
    }
  }));
}

function stubGraphqlOnce(payload: BulkPayload): void {
  stubGraphql(() => payload);
}

function stubGraphql(provider: () => BulkPayload): void {
  vi.stubGlobal("fetch", vi.fn(async () => {
    return Response.json({ data: graphqlData(provider()) });
  }));
}

function graphqlData(payload: BulkPayload): unknown {
  return {
    repository: {
      prompts: payload.prompts === null ? null : { entries: payload.prompts.map(promptEntry) },
      ref: { target: { oid: payload.sha } },
      skills: payload.skills === null ? null : { entries: payload.skills.map(skillFolderEntry) }
    }
  };
}

function promptEntry(entry: PromptEntry): unknown {
  return {
    name: entry.name,
    object: entry.blob === undefined
      ? entry.type === "tree" ? { entries: [] } : null
      : { isBinary: entry.blob.isBinary ?? false, text: entry.blob.text },
    type: entry.type
  };
}

function skillFolderEntry(folder: SkillFolderEntry): unknown {
  return {
    name: folder.name,
    object: { entries: folder.files.map(skillFileEntry) },
    type: "tree"
  };
}

function skillFileEntry(file: SkillFileEntry): unknown {
  return {
    name: file.name,
    object: file.blob === undefined
      ? file.type === "tree" ? { entries: [] } : null
      : { isBinary: file.blob.isBinary ?? false, text: file.blob.text },
    type: file.type
  };
}
