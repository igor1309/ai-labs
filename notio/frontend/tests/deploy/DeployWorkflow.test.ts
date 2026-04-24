import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Notio frontend deploy workflow", () => {
  it("shouldDeployPages_onReleaseWorkflowCall", () => {
    const workflow = readText("../../.github/workflows/notio-frontend-deploy.yml");

    expect(workflow).toMatch(/name:\s*Notio Frontend Deploy/);
    expect(workflow).toMatch(/workflow_call:/);
    expect(workflow).not.toMatch(/branches:\s*\n\s*-\s*trunk/);
    expect(workflow).not.toMatch(/-\s*"notio\/frontend\/\*\*"/);
    expect(workflow).toMatch(/uses:\s*\.\/\.github\/workflows\/notio-frontend-core\.yml/);
    expect(workflow).toMatch(/needs:\s*\[core\]/);
    expect(workflow).toMatch(/CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
    expect(workflow).toMatch(/CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
    expect(workflow).toMatch(/VITE_SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.NOTIO_SUPABASE_ANON_KEY\s*\}\}/);
    expect(workflow).toMatch(/VITE_SUPABASE_URL:\s*\$\{\{\s*secrets\.NOTIO_SUPABASE_URL\s*\}\}/);
    expect(workflow).toMatch(/npm run build/);
    expect(workflow).toMatch(/wrangler pages deploy dist --project-name notio-frontend --cwd notio\/frontend/);
  });

  it("shouldPointWranglerToStaticBuildOutput", () => {
    const config = readText("wrangler.toml");

    expect(config).toMatch(/^name = "notio-frontend"$/m);
    expect(config).toMatch(/^pages_build_output_dir = "dist"$/m);
  });
});

function readText(path: string): string {
  expect(existsSync(path), `expected ${path} to exist`).toBe(true);

  return readFileSync(path, "utf8");
}
