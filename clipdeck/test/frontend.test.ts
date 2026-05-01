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
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value)
    });
  });

  test("should not render item data before shared secret is accepted", async () => {
    await import("../src/static/app.js");

    expect(document.querySelectorAll("[data-item-id]").length).toBe(0);
  });

  test("should render items after backend accepts shared secret", async () => {
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

    await unlock();

    expect(document.querySelectorAll("[data-item-id]").length).toBe(1);
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

    await unlock();
    document.querySelector<HTMLButtonElement>("[data-item-id]")!.click();
    await flushAsync();

    expect([writeText.mock.calls[0]?.[0], document.querySelector("[data-toast]")?.textContent]).toEqual([
      "Prompt body",
      "Copied"
    ]);
  });

  test("should replace rendered list on reload", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({
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
      }))
      .mockResolvedValueOnce(Response.json({
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
    }));
    await import("../src/static/app.js");

    await unlock();
    document.querySelector<HTMLButtonElement>("[data-reload]")!.click();
    await flushAsync();

    expect(Array.from(document.querySelectorAll<HTMLElement>("[data-item-id]")).map((item) => item.getAttribute("data-item-id"))).toEqual([
      "prompts/second.md"
    ]);
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

    await unlock();

    expect(document.querySelector("[data-item-id]")?.classList.contains("resource-backed")).toBe(true);
  });
});

async function unlock(): Promise<void> {
  document.querySelector<HTMLInputElement>("[data-secret-input]")!.value = "secret";
  document.querySelector<HTMLFormElement>("[data-unlock-form]")!.dispatchEvent(new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true
  }));
  await flushAsync();
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
