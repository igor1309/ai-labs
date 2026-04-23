---
title: Supabase Config
date: 2026-04-23
model: claude-opus-4-6
description: "Defines the config module that reads and validates Vite env vars for the mvp_01 frontend Supabase connection."
version: 0.0.1
status: draft
type: spec
---

# Supabase Config

## Goal

Read and validate Supabase configuration from Vite environment variables. Single source of config truth for the mvp_01 frontend. Located at `notio/frontend/src/config.ts` (per ADR-006 §Architectural Shape).

## Public interface

### Types

```ts
export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export class ConfigError extends Error {}
```

### Function

```ts
export function readConfig(): SupabaseConfig;
```

## Behavior rules

1. **Reads two variables.** `readConfig()` reads `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`.
2. **Missing variable.** If either variable is `undefined` or empty string, throws `ConfigError` with a message naming the missing variable.
3. **Trimming.** Returned values are trimmed of leading/trailing whitespace.
4. **No other variables.** This module reads no other `import.meta.env` variables.
5. **Sole reader.** This is the only module in the frontend that reads `import.meta.env.VITE_*` (per ADR-006 §Enforcement).
6. **No SDK import.** This module MUST NOT import `@supabase/supabase-js`. Supabase client creation is the composition root's responsibility (`main.ts`), which imports `createClient` and passes the client to adapter modules.
7. **No service-role key.** No env var matching `VITE_SUPABASE_SERVICE` or any pattern interpretable as a service-role key is read, referenced, or documented in this module (per ADR-001/002 §Enforcement).

## Tests (required)

Validation:

- `readConfig()` returns config when both env vars are set
- `readConfig()` throws `ConfigError` when `VITE_SUPABASE_URL` is missing
- `readConfig()` throws `ConfigError` when `VITE_SUPABASE_ANON_KEY` is missing
- `readConfig()` throws `ConfigError` when `VITE_SUPABASE_URL` is empty string
- `readConfig()` throws `ConfigError` when `VITE_SUPABASE_ANON_KEY` is empty string
- error message names the specific missing variable

Shape:

- returned `supabaseUrl` matches the env var value
- returned `supabaseAnonKey` matches the env var value
- returned values are trimmed of whitespace

## Done criteria

- `SupabaseConfig`, `ConfigError`, and `readConfig` exported from `notio/frontend/src/config.ts`.
- `config.ts` is the only file in the frontend that reads `import.meta.env.VITE_*` (grep gate).
- No reference to `VITE_SUPABASE_SERVICE` or similar in any frontend file (grep gate).
- All tests above pass.
