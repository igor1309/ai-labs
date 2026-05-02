import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigError, readConfig } from "../../src/config";

const SUPABASE_URL_KEY = "VITE_SUPABASE_URL";
const SUPABASE_ANON_KEY_KEY = "VITE_SUPABASE_ANON_KEY";

describe("readConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shouldReturnConfig_onBothEnvVarsSet", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    const config = readConfig();

    expect(config).toEqual({
      supabaseAnonKey: "anon-key",
      supabaseUrl: "https://project.supabase.co"
    });
  });

  it("shouldThrowConfigError_onMissingSupabaseUrl", () => {
    vi.stubEnv(SUPABASE_URL_KEY, undefined);
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldThrowConfigError_onMissingSupabaseAnonKey", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, undefined);

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldThrowConfigError_onEmptySupabaseUrl", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldThrowConfigError_onEmptySupabaseAnonKey", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "");

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldThrowConfigError_onWhitespaceOnlySupabaseUrl", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "   ");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldThrowConfigError_onWhitespaceOnlySupabaseAnonKey", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "   ");

    expect(() => readConfig()).toThrow(ConfigError);
  });

  it("shouldNameMissingVariableInErrorMessage_onMissingSupabaseUrl", () => {
    vi.stubEnv(SUPABASE_URL_KEY, undefined);
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    expect(() => readConfig()).toThrow(SUPABASE_URL_KEY);
  });

  it("shouldNameMissingVariableInErrorMessage_onMissingSupabaseAnonKey", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, undefined);

    expect(() => readConfig()).toThrow(SUPABASE_ANON_KEY_KEY);
  });

  it("shouldReturnSupabaseUrlMatchingEnvValue_onValidConfig", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://matching.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "anon-key");

    const config = readConfig();

    expect(config.supabaseUrl).toBe("https://matching.supabase.co");
  });

  it("shouldReturnSupabaseAnonKeyMatchingEnvValue_onValidConfig", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "https://project.supabase.co");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "matching-anon-key");

    const config = readConfig();

    expect(config.supabaseAnonKey).toBe("matching-anon-key");
  });

  it("shouldTrimValues_onSurroundingWhitespace", () => {
    vi.stubEnv(SUPABASE_URL_KEY, "  https://trimmed.supabase.co  ");
    vi.stubEnv(SUPABASE_ANON_KEY_KEY, "  trimmed-anon-key  ");

    const config = readConfig();

    expect(config).toEqual({
      supabaseAnonKey: "trimmed-anon-key",
      supabaseUrl: "https://trimmed.supabase.co"
    });
  });
});
