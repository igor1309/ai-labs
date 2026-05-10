// @vitest-environment jsdom
/// <reference lib="dom" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("clipdeck frontend", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    document.body.innerHTML = readFileSync(join(process.cwd(), "src/static/index.html"), "utf8");
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("localStorage", {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value))
    });
  });

  test("should fetch items on load", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ sections: [] }));

    await import("../src/static/app.js");
    await flushAsync();

    expect(itemsFetchCalls().map((call) => call[0])).toEqual(["/api/items"]);
  });

  test("should fetch items without authorization header", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ sections: [] }));

    await import("../src/static/app.js");
    await flushAsync();

    expect(itemsFetchCalls().map((call) => call[1])).toEqual([undefined]);
  });

  test("should not render unlock form or secret input", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ sections: [] }));

    await import("../src/static/app.js");
    await flushAsync();

    expect([
      document.querySelector("[data-unlock-form]"),
      document.querySelector("[data-secret-input]")
    ]).toEqual([null, null]);
  });

  test("should not access stored clipdeck secret", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ sections: [] }));

    await import("../src/static/app.js");
    await flushAsync();

    expect([
      vi.mocked(localStorage.getItem).mock.calls,
      vi.mocked(localStorage.setItem).mock.calls,
      vi.mocked(localStorage.removeItem).mock.calls
    ]).toEqual([[], [], []]);
  });

  test("should render items after direct load", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "prompts",
          items: [
            {
              body: "Prompt body",
              id: "prompts/foo.md",
              kind: "prompt",
              subtitle: "Details",
              title: "Foo"
            }
          ],
          title: "Prompts"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelectorAll("[data-item-id]").length).toBe(1);
  });

  test("should remove skeleton and show populated sections after direct load", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "prompts",
          items: [
            {
              body: "Prompt body",
              id: "prompts/foo.md",
              kind: "prompt",
              subtitle: "Details",
              title: "Foo"
            }
          ],
          title: "Prompts"
        }
      ]
    }));

    await import("../src/static/app.js");
    await flushAsync();

    expect([
      document.querySelectorAll("[data-skeleton]").length,
      document.querySelector<HTMLElement>("[data-sections]")?.hidden,
      document.querySelectorAll("[data-item-id]").length
    ]).toEqual([0, false, 1]);
  });

  test("should copy item body and show success feedback", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "prompts",
          items: [
            {
              body: "Prompt body",
              id: "prompts/foo.md",
              kind: "prompt",
              subtitle: "",
              title: "Foo"
            }
          ],
          title: "Prompts"
        }
      ]
    }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText
      }
    });
    await import("../src/static/app.js");
    await flushAsync();
    document.querySelector<HTMLButtonElement>("[data-item-id]")!.click();
    await flushAsync();

    expect([writeText.mock.calls[0]?.[0], document.querySelector("[data-toast]")?.textContent]).toEqual([
      "Prompt body",
      "Copied"
    ]);
  });

  test("should replace rendered list on reload", async () => {
    const itemsResponses = [
      Response.json({
        sections: [
          {
            id: "prompts",
            items: [
              {
                body: "First",
                id: "prompts/first.md",
                kind: "prompt",
                subtitle: "",
                title: "First"
              }
            ],
            title: "Prompts"
          }
        ]
      }),
      Response.json({
        sections: [
          {
            id: "prompts",
            items: [
              {
                body: "Second",
                id: "prompts/second.md",
                kind: "prompt",
                subtitle: "",
                title: "Second"
              }
            ],
            title: "Prompts"
          }
        ]
      })
    ];
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/items") {
        return itemsResponses.shift() ?? new Response("no more items", { status: 500 });
      }
      return Response.json({ version: "test" });
    });
    await import("../src/static/app.js");
    await flushAsync();
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    await flushAsync();

    expect(Array.from(document.querySelectorAll<HTMLElement>("[data-item-id]")).map((item) => item.getAttribute("data-item-id"))).toEqual([
      "prompts/second.md"
    ]);
  });

  test("should render skeleton before initial items fetch resolves", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));

    await import("../src/static/app.js");

    expect(document.querySelectorAll("[data-skeleton]").length).toBe(1);
  });

  test("should render at least three skeleton placeholder items", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));

    await import("../src/static/app.js");

    expect(document.querySelectorAll("[data-skeleton] .skeleton-item").length).toBeGreaterThanOrEqual(3);
  });

  test("should hide skeleton placeholders from accessibility APIs and focus order", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));

    await import("../src/static/app.js");

    expect(skeletonAccessibilityProjection()).toEqual({
      focusableDescendantCount: 0,
      itemAriaHidden: ["true", "true", "true"],
      skeletonAriaHidden: "true"
    });
  });

  test("should keep legacy loading indicator hidden and empty across item loading states", async () => {
    const initialItems = deferred<Response>();
    const reloadItems = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/items") {
        return itemsFetchCalls().length === 0 ? initialItems.promise : reloadItems.promise;
      }
      return Response.json({ version: "test" });
    });

    await import("../src/static/app.js");
    const initialProjection = loadingProjection();
    initialItems.resolve(Response.json({ sections: [] }));
    await flushAsync();
    const successProjection = loadingProjection();
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    const reloadProjection = loadingProjection();
    reloadItems.resolve(new Response("boom", { status: 500 }));
    await flushAsync();
    const errorProjection = loadingProjection();

    expect([
      initialProjection,
      successProjection,
      reloadProjection,
      errorProjection
    ]).toEqual([
      { hidden: true, textContent: "" },
      { hidden: true, textContent: "" },
      { hidden: true, textContent: "" },
      { hidden: true, textContent: "" }
    ]);
  });

  test("should surface a failure toast when the backend returns a non-auth error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-toast]")?.textContent).toMatch(/fail/i);
  });

  test("should remove skeleton on fetch rejection", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelectorAll("[data-skeleton]").length).toBe(0);
  });

  test("should remove skeleton on non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("boom", { status: 500 }));

    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelectorAll("[data-skeleton]").length).toBe(0);
  });

  test("should remove skeleton on JSON parse failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("not json"));

    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelectorAll("[data-skeleton]").length).toBe(0);
  });

  test("should fetch on reload without stored secret", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ sections: [] }));
    await import("../src/static/app.js");
    await flushAsync();

    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    await flushAsync();

    expect(itemsFetchCalls().map((call) => call[0])).toEqual([
      "/api/items",
      "/api/items"
    ]);
  });

  test("should show skeleton and remove rendered items during reload refetch", async () => {
    const reloadItems = deferred<Response>();
    let itemRequestCount = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/items") {
        itemRequestCount += 1;
      }
      if (String(input) === "/api/items" && itemRequestCount === 1) {
        return Response.json({
          sections: [
            {
              id: "prompts",
              items: [
                {
                  body: "First",
                  id: "prompts/first.md",
                  kind: "prompt",
                  subtitle: "",
                  title: "First"
                }
              ],
              title: "Prompts"
            }
          ]
        });
      }
      if (String(input) === "/api/items") {
        return reloadItems.promise;
      }
      return Response.json({ version: "test" });
    });

    await import("../src/static/app.js");
    await flushAsync();
    const renderedItemCount = document.querySelectorAll("[data-item-id]").length;
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();

    expect([
      renderedItemCount,
      document.querySelectorAll("[data-skeleton]").length,
      document.querySelectorAll("[data-item-id]").length
    ]).toEqual([1, 1, 0]);
  });

  test("css hides elements with the hidden attribute", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");

    expect(css).toMatch(/\[hidden\][^{]*\{[^}]*display:\s*none/);
  });

  test("css should shape skeleton items like cards with animation", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");
    const itemBlock = cssBlock(css, ".item");
    const skeletonItemBlock = cssBlock(css, ".skeleton-item");

    expect(cssDeclarationsProjection(skeletonItemBlock, itemBlock)).toEqual({
      animation: expect.stringMatching(/\S/),
      borderRadius: "10px",
      minHeight: expect.stringMatching(/[1-9]/),
      padding: "14px 16px",
      width: "100%"
    });
  });

  test("css should disable skeleton animation under reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");

    expect(reducedMotionSkeletonAnimationProjection(css)).toBe(true);
  });

  test("should render skill version badge when version is provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "standalone",
              subtitle: "Details",
              title: "Example",
              version: "1.2.3"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id] [data-version]")?.textContent).toBe("v1.2.3");
  });

  test("should omit version badge when version is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "standalone",
              subtitle: "Details",
              title: "Example"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id] [data-version]")).toBeNull();
  });

  test("should render skill description text from item.description", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              description: "Composition root wiring rules — interface-only boundaries",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "standalone",
              subtitle: "composition-root",
              title: "Composition Root Wiring Guide"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id] .description")?.textContent).toBe(
      "Composition root wiring rules — interface-only boundaries"
    );
  });

  test("should omit subtitle element when item.subtitle equals item.title", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              id: "dev-skills/public/test-runner/SKILL.md",
              kind: "skill",
              skillShape: "standalone",
              subtitle: "test-runner",
              title: "test-runner"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id] .subtitle")).toBeNull();
  });

  test("should position toast at the top of the viewport", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");
    const toastBlock = css.match(/\.toast\s*\{[^}]*\}/)?.[0] ?? "";

    expect([toastBlock.includes("top:"), toastBlock.includes("bottom:")]).toEqual([true, false]);
  });

  test("should render skill subtitle text from item.subtitle", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "standalone",
              subtitle: "Collaborative discussion mode",
              title: "Example"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id] .subtitle")?.textContent).toBe(
      "Collaborative discussion mode"
    );
  });

  test("should fetch and render app version in footer", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/version") {
        return Response.json({ version: "9.9.9" });
      }
      return Response.json({ sections: [] });
    });
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-app-version]")?.textContent).toBe("v9.9.9");
  });

  test("should leave version footer empty when /api/version fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/version") {
        return new Response("nope", { status: 500 });
      }
      return Response.json({ sections: [] });
    });
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-app-version]")?.textContent).toBe("");
  });

  test("should visually distinguish resource backed skills", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      sections: [
        {
          id: "skills",
          items: [
            {
              body: "Skill body",
              id: "dev-skills/public/example/SKILL.md",
              kind: "skill",
              skillShape: "resource-backed",
              subtitle: "",
              title: "Example"
            }
          ],
          title: "Skills"
        }
      ]
    }));
    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-item-id]")?.classList.contains("resource-backed")).toBe(true);
  });
});

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  return {
    promise: new Promise((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: resolvePromise
  };
}

function itemsFetchCalls(): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter((call) => String(call[0]) === "/api/items");
}

function loadingProjection(): {
  hidden: boolean | undefined;
  textContent: string | undefined;
} {
  const loading = document.querySelector<HTMLElement>("[data-loading]");
  return {
    hidden: loading?.hidden,
    textContent: loading?.textContent ?? undefined
  };
}

function cssBlock(css: string, selector: string): string {
  return css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

function cssDeclaration(block: string, property: string): string {
  return block.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1].trim() ?? "";
}

function cssDeclarationsProjection(skeletonItemBlock: string, itemBlock: string): {
  animation: string;
  borderRadius: string;
  minHeight: string;
  padding: string;
  width: string;
} {
  return {
    animation: cssDeclaration(skeletonItemBlock, "animation"),
    borderRadius: cssDeclaration(skeletonItemBlock, "border-radius") === cssDeclaration(itemBlock, "border-radius")
      ? cssDeclaration(skeletonItemBlock, "border-radius")
      : "",
    minHeight: cssDeclaration(skeletonItemBlock, "min-height"),
    padding: cssDeclaration(skeletonItemBlock, "padding") === cssDeclaration(itemBlock, "padding")
      ? cssDeclaration(skeletonItemBlock, "padding")
      : "",
    width: cssDeclaration(skeletonItemBlock, "width") === cssDeclaration(itemBlock, "width")
      ? cssDeclaration(skeletonItemBlock, "width")
      : ""
  };
}

function reducedMotionSkeletonAnimationProjection(css: string): boolean {
  return /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\.skeleton-item\s*\{[\s\S]*?(animation:\s*none|animation-name:\s*none|animation-duration:\s*0s)/.test(css);
}

function skeletonAccessibilityProjection(): {
  focusableDescendantCount: number;
  itemAriaHidden: (string | null)[];
  skeletonAriaHidden: string | null;
} {
  const interactiveSelector = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  const skeletonItems = Array.from(document.querySelectorAll(".skeleton-item"));
  return {
    focusableDescendantCount: skeletonItems.reduce((count, item) => count + item.querySelectorAll(interactiveSelector).length, 0),
    itemAriaHidden: skeletonItems.map((item) => item.getAttribute("aria-hidden")),
    skeletonAriaHidden: document.querySelector("[data-skeleton]")?.getAttribute("aria-hidden") ?? null
  };
}
