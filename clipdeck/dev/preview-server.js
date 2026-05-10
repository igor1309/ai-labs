import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 8000;
const ITEMS_DELAY_MS = 400;

const here = fileURLToPath(new URL(".", import.meta.url));
const staticRoot = resolve(here, "..", "src", "static");

const mimeByExt = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const itemsFixture = {
  sections: [
    {
      id: "prompts",
      title: "Prompts",
      items: [
        {
          id: "prompts/code-review.md",
          title: "Code review",
          subtitle: "Walk a diff and surface risks",
          kind: "prompt",
          body: "You are a senior reviewer. Read the diff and report risks, regressions, and suggested fixes."
        },
        {
          id: "prompts/blank-page.md",
          title: "Blank page",
          subtitle: "",
          kind: "prompt",
          body: "Write whatever you like."
        }
      ]
    },
    {
      id: "skills",
      title: "Skills",
      items: [
        {
          id: "dev-skills/public/discuss/SKILL.md",
          title: "Discuss",
          subtitle: "Collaborative thinking before building",
          kind: "skill",
          skillShape: "resource-backed",
          body: "# Discuss\nA collaborator's mode."
        }
      ]
    }
  ]
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (request.method === "GET" && url.pathname === "/api/items") {
    await handleItems(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/version") {
    handleVersion(response);
    return;
  }

  await handleStatic(url.pathname, response);
});

async function handleItems(request, response) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ITEMS_DELAY_MS));
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(itemsFixture));
}

function handleVersion(response) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ version: "preview" }));
}

async function handleStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(staticRoot, safe);

  if (!filePath.startsWith(staticRoot)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const type = mimeByExt[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
}

server.listen(PORT, HOST, () => {
  console.log(`clipdeck preview at http://${HOST}:${PORT}`);
});
