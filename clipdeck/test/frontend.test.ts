// @vitest-environment jsdom
/// <reference lib="dom" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("clipdeck frontend", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    document.body.innerHTML = readFileSync(join(process.cwd(), "src/static/index.html"), "utf8");
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("localStorage", {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value))
    });
    vi.stubGlobal("sessionStorage", {
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

  test("should render filter row between toolbar and sections after items load", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    expect(filterContractProjection()).toEqual({
      filterInputCount: 1,
      filterRowCount: 1,
      rowContainsInput: true,
      rowIndex: 1,
      sectionsIndex: 2,
      toolbarIndex: 0
    });
  });

  test("should render filter input with placeholder and without autofocus", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    expect(filterInputAttributesProjection()).toEqual({
      autofocus: false,
      placeholder: expect.stringMatching(/\S/)
    });
  });

  test("should render all returned items when filter is empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    expect(renderedItemIds()).toEqual([
      "prompts/review.md",
      "prompts/standup.md",
      "skills/parser.md"
    ]);
  });

  test("should render title substring matches after debounce", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual(["prompts/review.md"]);
  });

  test("should debounce filter updates until typing settles", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("s");
    await vi.advanceTimersByTimeAsync(100);
    typeFilterValue("sk");
    const beforeDebounceIds = renderedItemIds();
    await vi.advanceTimersByTimeAsync(150);

    expect({
      afterDebounceIds: renderedItemIds(),
      beforeDebounceIds
    }).toEqual({
      afterDebounceIds: ["skills/parser.md"],
      beforeDebounceIds: [
        "prompts/review.md",
        "prompts/standup.md",
        "skills/parser.md"
      ]
    });
  });

  test("should render subtitle substring matches after debounce", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("ritual");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual(["prompts/standup.md"]);
  });

  test("should render description substring matches after debounce", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("structured data");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual(["skills/parser.md"]);
  });

  test("should match filter without case sensitivity", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("REVIEW");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual(["prompts/review.md"]);
  });

  test("should treat whitespace-only filter as empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("   ");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual([
      "prompts/review.md",
      "prompts/standup.md",
      "skills/parser.md"
    ]);
  });

  test("should show filter clear button when input contains only whitespace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    typeFilterValue("   ");

    expect(filterClearButtonIsHidden()).toBe(false);
  });

  test("should trim padded filter before matching", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue(" review ");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedItemIds()).toEqual(["prompts/review.md"]);
  });

  test("should hide section heading when filter empties the section", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("parser");
    await vi.advanceTimersByTimeAsync(150);

    expect(renderedSectionHeadings()).toEqual(["Skills"]);
  });

  test("should render filter empty state when no items match", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("no-match");
    await vi.advanceTimersByTimeAsync(150);

    expect(filterEmptyProjection()).toEqual({
      clearLabel: "Clear filter",
      emptyText: expect.stringContaining("No matches"),
      itemCount: 0,
      sectionsChildCount: 1
    });
  });

  test("should clear filter from empty-state action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("no-match");
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLButtonElement>("[data-filter-empty-clear]")!.click();

    expect(filterClearProjection()).toEqual({
      activeElement: document.querySelector("[data-filter-input]"),
      emptyStateCount: 0,
      inputValue: "",
      itemIds: [
        "prompts/review.md",
        "prompts/standup.md",
        "skills/parser.md"
      ]
    });
  });

  test("should hide filter clear button when input is empty and show it when input has value", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    const hiddenBeforeInput = filterClearButtonIsHidden();
    vi.useFakeTimers();
    typeFilterValue("review");
    const hiddenImmediatelyAfterInput = filterClearButtonIsHidden();
    await vi.advanceTimersByTimeAsync(150);

    expect({
      hiddenAfterInput: filterClearButtonIsHidden(),
      hiddenImmediatelyAfterInput,
      hiddenBeforeInput
    }).toEqual({
      hiddenAfterInput: false,
      hiddenImmediatelyAfterInput: false,
      hiddenBeforeInput: true
    });
  });

  test("should clear filter from clear button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLButtonElement>("[data-filter-clear]")!.click();

    expect(filterClearProjection()).toEqual({
      activeElement: document.querySelector("[data-filter-input]"),
      emptyStateCount: 0,
      inputValue: "",
      itemIds: [
        "prompts/review.md",
        "prompts/standup.md",
        "skills/parser.md"
      ]
    });
  });

  test("should clear filter on Escape key and keep input focused", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);
    const input = document.querySelector<HTMLInputElement>("[data-filter-input]")!;
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    expect(filterClearProjection()).toEqual({
      activeElement: input,
      emptyStateCount: 0,
      inputValue: "",
      itemIds: [
        "prompts/review.md",
        "prompts/standup.md",
        "skills/parser.md"
      ]
    });
  });

  test("should hide filter input while skeleton is on screen", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));

    await import("../src/static/app.js");

    expect(document.querySelector("[data-filter-input]")).toBeNull();
  });

  test("should hide filter input when no items are present", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ sections: [] }));

    await import("../src/static/app.js");
    await flushAsync();

    expect(document.querySelector("[data-filter-input]")).toBeNull();
  });

  test("should reset filter before reload renders new items", async () => {
    const itemsResponses = [
      Response.json(makeLibrarySections()),
      Response.json({
        sections: [
          {
            id: "prompts",
            items: [
              {
                body: "Reloaded",
                id: "prompts/reloaded.md",
                kind: "prompt",
                subtitle: "",
                title: "Reloaded"
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

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    const inputValueDuringReload = document.querySelector<HTMLInputElement>("[data-filter-input]")?.value;
    vi.useRealTimers();
    await flushAsync();

    expect({
      inputValueAfterReload: document.querySelector<HTMLInputElement>("[data-filter-input]")?.value,
      inputValueDuringReload,
      itemIds: renderedItemIds()
    }).toEqual({
      inputValueAfterReload: "",
      inputValueDuringReload: undefined,
      itemIds: ["prompts/reloaded.md"]
    });
  });

  test("should not persist filter value in storage", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    vi.useRealTimers();
    await flushAsync();

    expect(filterStorageProjection()).toEqual({
      localGet: [],
      localRemove: [],
      localSet: [],
      sessionGet: [],
      sessionRemove: [],
      sessionSet: []
    });
  });

  test("should not persist filter value in the url", async () => {
    window.history.replaceState(null, "", "/?filter=review#filter=review");
    const pushState = vi.spyOn(history, "pushState");
    const replaceState = vi.spyOn(history, "replaceState");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    const initialInputValue = document.querySelector<HTMLInputElement>("[data-filter-input]")?.value;
    const initialItemIds = renderedItemIds();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);

    expect({
      initialInputValue,
      initialItemIds,
      pushCalls: pushState.mock.calls,
      replaceCalls: replaceState.mock.calls
    }).toEqual({
      initialInputValue: "",
      initialItemIds: [
        "prompts/review.md",
        "prompts/standup.md",
        "skills/parser.md"
      ],
      pushCalls: [],
      replaceCalls: []
    });
  });

  test("should preserve original copy body for filtered item", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(makeLibrarySections()));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText
      }
    });
    await import("../src/static/app.js");
    await flushAsync();

    vi.useFakeTimers();
    typeFilterValue("review");
    await vi.advanceTimersByTimeAsync(150);
    document.querySelector<HTMLButtonElement>("[data-item-id]")!.click();
    await Promise.resolve();

    expect(writeText.mock.calls.map((call) => call[0])).toEqual(["Review body"]);
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

  test("should keep toolbar visible while skeleton is on screen", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));

    await import("../src/static/app.js");

    expect(hasHiddenAncestor(document.querySelector(".toolbar"))).toBe(false);
  });

  test("should keep legacy loading indicator hidden and empty across item loading states", async () => {
    const initialItems = deferred<Response>();
    const reloadItems = deferred<Response>();
    let itemRequestCount = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/items") {
        itemRequestCount += 1;
        return itemRequestCount === 1 ? initialItems.promise : reloadItems.promise;
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

  test("should not copy rendered item text into reload skeleton", async () => {
    const reloadItems = deferred<Response>();
    const uniqueTitle = "Unique Prompt Title 4729";
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
                  body: "Prompt body",
                  id: "prompts/unique.md",
                  kind: "prompt",
                  subtitle: "",
                  title: uniqueTitle
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
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();

    expect(Array.from(document.querySelectorAll(".skeleton-item")).map((item) => item.textContent)).not.toContain(uniqueTitle);
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

  test("css should space skeleton items in the sections grid", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");

    expect(skeletonLayoutProjection(css)).toEqual({
      display: "grid",
      gap: "12px",
      gridColumn: "1 / -1",
      width: "100%"
    });
  });

  test("css should disable skeleton animation under reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");

    expect(reducedMotionSkeletonAnimationProjection(css)).toBe(true);
  });

  test("css should make filter row sticky with concrete top offset", () => {
    const css = readFileSync(join(process.cwd(), "src/static/app.css"), "utf8");

    expect(filterRowCssProjection(css)).toEqual({
      position: "sticky",
      top: expect.stringMatching(/\S/)
    });
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

function makeLibrarySections(): {
  sections: Array<{
    id: string;
    items: Array<{
      body: string;
      description?: string;
      id: string;
      kind: string;
      subtitle?: string;
      title: string;
    }>;
    title: string;
  }>;
} {
  return {
    sections: [
      {
        id: "prompts",
        items: [
          {
            body: "Review body",
            description: "Keeps pull requests focused",
            id: "prompts/review.md",
            kind: "prompt",
            subtitle: "Code quality",
            title: "Code review"
          },
          {
            body: "Standup body",
            id: "prompts/standup.md",
            kind: "prompt",
            subtitle: "Team ritual",
            title: "Daily sync"
          }
        ],
        title: "Prompts"
      },
      {
        id: "skills",
        items: [
          {
            body: "Parser body",
            description: "Extract structured data from docs",
            id: "skills/parser.md",
            kind: "skill",
            subtitle: "Skill helper",
            title: "Parser"
          }
        ],
        title: "Skills"
      }
    ]
  };
}

function filterContractProjection(): {
  filterInputCount: number;
  filterRowCount: number;
  rowContainsInput: boolean;
  rowIndex: number;
  sectionsIndex: number;
  toolbarIndex: number;
} {
  const libraryChildren = Array.from(document.querySelector("[data-library]")?.children ?? []);
  const filterRow = document.querySelector("[data-filter-row]");
  return {
    filterInputCount: document.querySelectorAll("[data-filter-input]").length,
    filterRowCount: document.querySelectorAll("[data-filter-row]").length,
    rowContainsInput: filterRow?.querySelectorAll("[data-filter-input]").length === 1,
    rowIndex: filterRow === null ? -1 : libraryChildren.indexOf(filterRow),
    sectionsIndex: libraryChildren.indexOf(document.querySelector("[data-sections]")!),
    toolbarIndex: libraryChildren.indexOf(document.querySelector(".toolbar")!)
  };
}

function filterInputAttributesProjection(): {
  autofocus: boolean;
  placeholder: string | undefined;
} {
  const input = document.querySelector<HTMLInputElement>("[data-filter-input]");
  return {
    autofocus: input?.hasAttribute("autofocus") ?? false,
    placeholder: input?.getAttribute("placeholder") ?? undefined
  };
}

function renderedItemIds(): (string | undefined)[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-item-id]")).map((item) => item.dataset.itemId);
}

function renderedSectionHeadings(): (string | null)[] {
  return Array.from(document.querySelectorAll(".section-heading")).map((heading) => heading.textContent);
}

function typeFilterValue(value: string): void {
  const input = document.querySelector<HTMLInputElement>("[data-filter-input]")!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function filterEmptyProjection(): {
  clearLabel: string | null | undefined;
  emptyText: string | null | undefined;
  itemCount: number;
  sectionsChildCount: number | undefined;
} {
  return {
    clearLabel: document.querySelector("[data-filter-empty-clear]")?.textContent,
    emptyText: document.querySelector("[data-filter-empty]")?.textContent,
    itemCount: document.querySelectorAll("[data-item-id]").length,
    sectionsChildCount: document.querySelector("[data-sections]")?.children.length
  };
}

function filterClearProjection(): {
  activeElement: Element | null;
  emptyStateCount: number;
  inputValue: string | undefined;
  itemIds: (string | undefined)[];
} {
  return {
    activeElement: document.activeElement,
    emptyStateCount: document.querySelectorAll("[data-filter-empty]").length,
    inputValue: document.querySelector<HTMLInputElement>("[data-filter-input]")?.value,
    itemIds: renderedItemIds()
  };
}

function filterClearButtonIsHidden(): boolean | undefined {
  return document.querySelector<HTMLButtonElement>("[data-filter-clear]")?.hidden;
}

function filterStorageProjection(): {
  localGet: unknown[][];
  localRemove: unknown[][];
  localSet: unknown[][];
  sessionGet: unknown[][];
  sessionRemove: unknown[][];
  sessionSet: unknown[][];
} {
  return {
    localGet: vi.mocked(localStorage.getItem).mock.calls,
    localRemove: vi.mocked(localStorage.removeItem).mock.calls,
    localSet: vi.mocked(localStorage.setItem).mock.calls,
    sessionGet: vi.mocked(sessionStorage.getItem).mock.calls,
    sessionRemove: vi.mocked(sessionStorage.removeItem).mock.calls,
    sessionSet: vi.mocked(sessionStorage.setItem).mock.calls
  };
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

function hasHiddenAncestor(element: Element | null): boolean {
  let currentElement: Element | null = element;
  while (currentElement !== null) {
    if (currentElement.hasAttribute("hidden")) {
      return true;
    }
    currentElement = currentElement.parentElement;
  }
  return false;
}

function cssBlock(css: string, selector: string): string {
  return css.match(new RegExp(`${escapeRegex(selector)}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

function cssDeclaration(block: string, property: string): string {
  return block.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1].trim() ?? "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function skeletonLayoutProjection(css: string): {
  display: string;
  gap: string;
  gridColumn: string;
  width: string;
} {
  const skeletonBlock = cssBlock(css, "[data-skeleton]");
  return {
    display: cssDeclaration(skeletonBlock, "display"),
    gap: cssDeclaration(skeletonBlock, "gap"),
    gridColumn: cssDeclaration(skeletonBlock, "grid-column"),
    width: cssDeclaration(skeletonBlock, "width")
  };
}

function filterRowCssProjection(css: string): {
  position: string;
  top: string;
} {
  const filterRowBlock = cssBlock(css, "[data-filter-row]");
  return {
    position: cssDeclaration(filterRowBlock, "position"),
    top: cssDeclaration(filterRowBlock, "top")
  };
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
