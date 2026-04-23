import { createClient } from "@supabase/supabase-js";
import { mount } from "svelte";

import App from "./app.svelte";
import { SupabaseAuthSession } from "./auth/SupabaseAuthSession";
import { SupabaseBrowseItemsReader } from "./browse/SupabaseBrowseItemsReader";
import { readConfig } from "./config";

const config = readConfig();
const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
const authSession = new SupabaseAuthSession(client);
const reader = new SupabaseBrowseItemsReader(client);
const target = document.getElementById("app");

if (target === null) {
  throw new Error("Missing app mount target");
}

export default mount(App, {
  props: {
    authSession,
    reader
  },
  target
});
