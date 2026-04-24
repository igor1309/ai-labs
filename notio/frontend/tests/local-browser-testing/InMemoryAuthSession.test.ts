import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { AuthState } from "../../src/auth/AuthSession";
import { InMemoryAuthSession } from "../../src/local-browser-testing/InMemoryAuthSession";

describe("InMemoryAuthSession", () => {
  it("file shouldExist_onLocalBrowserTestingAuthAdapter", () => {
    expect(existsSync("src/local-browser-testing/InMemoryAuthSession.ts")).toBe(true);
  });

  it("signIn shouldTransitionToAuthenticated_onGivenEmail", async () => {
    const sut = new InMemoryAuthSession();
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await sut.signIn("reader@example.com");

    expect(receivedStates.at(-1)).toEqual({ email: "reader@example.com", status: "authenticated" });
  });

  it("signOut shouldTransitionToUnauthenticated_onAuthenticatedSession", async () => {
    const sut = new InMemoryAuthSession();
    const receivedStates: AuthState[] = [];

    sut.subscribe(($0) => {
      receivedStates.push($0);
    });
    await sut.signIn("reader@example.com");
    await sut.signOut();

    expect(receivedStates.map(($0) => $0.status)).toEqual(["unauthenticated", "authenticated", "unauthenticated"]);
  });
});
