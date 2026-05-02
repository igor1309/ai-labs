import { afterEach, describe, expect, test, vi } from "vitest";

import type { Env } from "../src/api/auth";
import worker from "../src/index";

describe("GET /api/items", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("should return empty sections without authorization", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json([]);
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      200,
      {
        sections: [
          {
            id: "prompts",
            items: [],
            title: "Prompts"
          },
          {
            id: "skills",
            items: [],
            title: "Skills"
          }
        ]
      }
    ]);
  });

  test("should return prompts and skills sections without clipdeck auth header", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json([]);
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    let body: unknown = await response.text();
    try {
      body = JSON.parse(String(body));
    } catch {
      body = { error: "not_json" };
    }

    expect(body).toEqual({
      sections: [
        {
          id: "prompts",
          items: [],
          title: "Prompts"
        },
        {
          id: "skills",
          items: [],
          title: "Skills"
        }
      ]
    });
  });

  test("should send validators for item metadata revalidation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json([]);
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items"),
      makeEnv()
    );

    expect([
      response.headers.get("Cache-Control"),
      response.headers.get("ETag")
    ]).toEqual([
      "no-cache",
      "\"f93aabe7e9b94554d2a8ed3be82b119077d124840fae01af277af2d29d94dbb0\""
    ]);
  });

  test("should return not modified when item metadata validator matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return Response.json([]);
    }));

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

  test("should identify clipdeck as user agent for GitHub requests", async () => {
    const fetchCalls: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      if (init) {
        fetchCalls.push(init);
      }

      return Response.json([]);
    }));

    await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    expect(fetchCalls).toEqual([
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "clipdeck"
        })
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "clipdeck"
        })
      })
    ]);
  });

  test("should return discovered prompt and skill items from GitHub contents", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json([
          { path: "prompts/foo.md", type: "file" },
          { path: "prompts/sub", type: "dir" }
        ]);
      }

      if (url.includes("/git/trees/trunk:dev-skills/public?")) {
        return Response.json({
          tree: [
            { path: "example/SKILL.md", type: "blob" },
            { path: "example/helper.py", type: "blob" }
          ],
          truncated: false
        });
      }

      if (url.includes("/contents/prompts/foo.md?")) {
        return Response.json({
          content: btoa("---\ntitle: Foo Prompt\n---\nPrompt body\n"),
          encoding: "base64"
        });
      }

      if (url.includes("/contents/dev-skills/public/example/SKILL.md?")) {
        return Response.json({
          content: btoa("---\nname: example\ndescription: Skill details\n---\n# Example Skill\n\nSkill body\n"),
          encoding: "base64"
        });
      }

      return new Response("not found", { status: 404 });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    const body = await response.json();

    expect(body).toEqual({
      sections: [
        {
          id: "prompts",
          items: [
            {
              body: "Prompt body\n",
              id: "prompts/foo.md",
              kind: "prompt",
              subtitle: "",
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
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "resource-backed",
              subtitle: "Skill details",
              title: "Example Skill (example)"
            }
          ],
          title: "Skills"
        }
      ]
    });
  });

  test("should preserve utf8 prompt body decoded from GitHub contents", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json([
          { path: "prompts/foo.md", type: "file" }
        ]);
      }

      if (url.includes("/git/trees/trunk:dev-skills/public?")) {
        return Response.json({
          tree: [],
          truncated: false
        });
      }

      if (url.includes("/contents/prompts/foo.md?")) {
        return Response.json({
          content: encodeGithubContent("---\ntitle: Foo Prompt\n---\ncafé\nпривет\n"),
          encoding: "base64"
        });
      }

      return new Response("not found", { status: 404 });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{
        items: Array<{
          body: string;
        }>;
      }>;
    };

    expect(body.sections[0]?.items.map((item) => item.body)).toEqual(["café\nпривет\n"]);
  });

  test("should mark skills with sibling directories as resource backed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json([]);
      }

      if (url.includes("/git/trees/trunk:dev-skills/public?")) {
        return Response.json({
          tree: [
            { path: "example/SKILL.md", type: "blob" },
            { path: "example/references", type: "tree" }
          ],
          truncated: false
        });
      }

      if (url.includes("/contents/dev-skills/public/example/SKILL.md?")) {
        return Response.json({
          content: encodeGithubContent("---\ndescription: Skill details\n---\nSkill body\n"),
          encoding: "base64"
        });
      }

      return new Response("not found", { status: 404 });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{
        items: Array<{
          skillShape?: string;
        }>;
      }>;
    };

    expect(body.sections[1]?.items.map((item) => item.skillShape)).toEqual(["resource-backed"]);
  });

  test("should discover skills from recursive GitHub tree", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json([]);
      }

      if (url.includes("/git/trees/trunk:dev-skills/public?")) {
        return Response.json({
          tree: [
            { path: "example/SKILL.md", type: "blob" },
            { path: "example/references", type: "tree" }
          ],
          truncated: false
        });
      }

      if (url.includes("/contents/dev-skills/public/example/SKILL.md?")) {
        return Response.json({
          content: encodeGithubContent("---\ndescription: Skill details\n---\nSkill body\n"),
          encoding: "base64"
        });
      }

      return Response.json({ message: "unexpected request" }, { status: 500 });
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    const body = await response.json() as {
      sections: Array<{
        items: Array<{
          id: string;
          skillShape?: string;
        }>;
      }>;
    };

    expect(body.sections[1]?.items.map((item) => [item.id, item.skillShape])).toEqual([
      ["dev-skills/public/example/SKILL.md", "resource-backed"]
    ]);
  });

  test("should return source missing when an allowlisted source directory is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }

      return Response.json([]);
    }));

    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/items", {
        headers: {
          Authorization: "Bearer shared-secret"
        }
      }),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      502,
      {
        error: "source_missing",
        source: "prompts"
      }
    ]);
  });

  test("should return upstream failure when GitHub file read fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/contents/prompts?")) {
        return Response.json([
          { path: "prompts/foo.md", type: "file" }
        ]);
      }

      if (url.includes("/contents/dev-skills/public?")) {
        return Response.json([]);
      }

      return Response.json({ message: "server error" }, { status: 500 });
    }));

    let response: Response;
    try {
      response = await worker.fetch(
        new Request("https://clipdeck.example/api/items", {
          headers: {
            Authorization: "Bearer shared-secret"
          }
        }),
        makeEnv()
      );
    } catch {
      response = Response.json({ error: "threw" }, { status: 599 });
    }

    expect([response.status, await response.json()]).toEqual([
      502,
      {
        error: "upstream_github_failure",
        source: "prompts"
      }
    ]);
  });
});

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "github-token"
  };
}

function encodeGithubContent(content: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(content)));
}
