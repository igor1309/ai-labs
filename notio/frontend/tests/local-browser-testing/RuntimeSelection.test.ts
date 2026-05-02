import { readFileSync } from "node:fs";

import { mount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => {
  const authSession = { kind: "supabase-auth-session" };
  const browseItemsReader = { kind: "supabase-browse-items-reader" };
  const client = { kind: "supabase-client" };

  return {
    authSession,
    browseItemsReader,
    client,
    createClient: vi.fn(() => client),
    SupabaseAuthSession: vi.fn(function SupabaseAuthSessionDouble() {
      return authSession;
    }),
    SupabaseBrowseItemsReader: vi.fn(function SupabaseBrowseItemsReaderDouble() {
      return browseItemsReader;
    })
  };
});

vi.mock("svelte", () => ({
  mount: vi.fn(() => ({ destroy: vi.fn() }))
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: doubles.createClient
}));

vi.mock("../../src/auth/SupabaseAuthSession", () => ({
  SupabaseAuthSession: doubles.SupabaseAuthSession
}));

vi.mock("../../src/browse/SupabaseBrowseItemsReader", () => ({
  SupabaseBrowseItemsReader: doubles.SupabaseBrowseItemsReader
}));

const SUPABASE_URL_KEY = "VITE_SUPABASE_URL";
const SUPABASE_ANON_KEY_KEY = "VITE_SUPABASE_ANON_KEY";
const NOTIO_RUNTIME_KEY = "VITE_NOTIO_RUNTIME";

describe("local browser testing runtime selection", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    doubles.createClient.mockClear();
    doubles.SupabaseAuthSession.mockClear();
    doubles.SupabaseBrowseItemsReader.mockClear();
    vi.mocked(mount).mockClear();
    document.body.innerHTML = "";
  });

  it("script shouldExposeDevLocal_onLocalBrowserTestingRuntime", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["dev:local"]).toBe("VITE_NOTIO_RUNTIME=local vite");
  });

  it("runtime shouldUseLocalComposition_onExplicitLocalModeWithoutSupabaseConfig", async () => {
    vi.stubEnv(NOTIO_RUNTIME_KEY, "local");
    vi.stubEnv(SUPABASE_URL_KEY, undefined);
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, undefined);

    await import("../../src/main");

    expect(vi.mocked(mount).mock.calls[0]?.[1].props).toMatchObject({
      authSession: expect.any(Object),
      reader: expect.any(Object)
    });
  });

  it("runtime shouldKeepProductionConfigValidation_onMissingSupabaseConfigWithoutLocalMode", async () => {
    vi.stubEnv(NOTIO_RUNTIME_KEY, undefined);
    vi.stubEnv(SUPABASE_URL_KEY, undefined);
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, undefined);

    await expect(import("../../src/main")).rejects.toThrow(SUPABASE_ANON_KEY_KEY);
  });

  it("runtime shouldUseSupabaseComposition_onDefaultRuntimeWithSupabaseConfig", async () => {
    vi.stubEnv(NOTIO_RUNTIME_KEY, undefined);
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    await import("../../src/main");

    expect(vi.mocked(mount).mock.calls[0]?.[1].props).toMatchObject({
      authSession: doubles.authSession,
      reader: doubles.browseItemsReader
    });
  });
});
