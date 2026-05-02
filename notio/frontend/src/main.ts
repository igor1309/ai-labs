import { createClient } from "@supabase/supabase-js";
import { mount } from "svelte";

import App from "./app.svelte";
import { SupabaseAuthSession } from "./auth/SupabaseAuthSession";
import { SupabaseBrowseItemsReader } from "./browse/SupabaseBrowseItemsReader";
import { readConfig } from "./config";
import { createLocalRuntime, type NotioRuntime } from "./local-browser-testing/createLocalRuntime";

const runtime = createRuntime();
const target = document.getElementById("app");

if (target === null) {
  throw new Error("Missing app mount target");
}

export default mount(App, {
  props: {
    authSession: runtime.authSession,
    reader: runtime.reader
  },
  target
});

function createRuntime(): NotioRuntime {
  if (import.meta.env.VITE_NOTIO_RUNTIME === "local") {
    return createLocalRuntime();
  }

  const config = readConfig();
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey);

  return {
    authSession: new SupabaseAuthSession(client),
    reader: new SupabaseBrowseItemsReader(client)
  };
}
