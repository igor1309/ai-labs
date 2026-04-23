import { existsSync } from "node:fs";

import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import App from "../src/app.svelte";
import type { AuthSession, AuthState } from "../src/auth/AuthSession";
import type { BrowseItemsReader, Page, PageCursor } from "../src/browse/BrowseItemsReader";

describe("app shell", () => {
  it("files shouldExist_onRunnableSpaShell", () => {
    expect(["index.html", "src/app.svelte", "src/main.ts"].map((path) => existsSync(path))).toEqual([true, true, true]);
  });

  it("render shouldComposeBrowseView_onAuthenticatedSession", async () => {
    render(App, {
      props: {
        authSession: new AuthSessionDouble({ email: "reader@example.com", status: "authenticated" }),
        reader: new ReaderDouble(makePage())
      }
    });

    await waitFor(() => expect(screen.getByText("Title 1")).toBeDefined());
  });
});

class AuthSessionDouble implements AuthSession {
  constructor(private state: AuthState) {}

  destroy(): void {}

  async signIn(): Promise<void> {}

  async signOut(): Promise<void> {
    this.state = { status: "unauthenticated" };
  }

  subscribe(callback: (state: AuthState) => void): () => void {
    callback(this.state);

    return () => undefined;
  }
}

class ReaderDouble implements BrowseItemsReader {
  constructor(private readonly page: Page) {}

  async fetchAfter(_cursor: PageCursor): Promise<Page> {
    return this.page;
  }

  async fetchFirstPage(): Promise<Page> {
    return this.page;
  }
}

function makePage(): Page {
  return {
    items: [
      {
        capturedAt: new Date(Date.UTC(2026, 0, 1, 10, 0, 0, 0)).toISOString(),
        capturedDescription: "Description 1",
        capturedTitle: "Title 1",
        enrichment: "full",
        id: "00000000-0000-0000-0000-000000000001",
        kind: "link",
        note: "Note 1",
        sourceType: "web_page",
        url: "https://example.com/1"
      }
    ],
    nextCursor: null
  };
}
