import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const openApiPath = join(projectRoot, "docs/api/openapi.yml");
const skillsDirectory = join(projectRoot, "skills");

test("operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences", () => {
  const contractRoutes = readOpenApiRoutes(openApiPath);
  const citations = readSkillRouteCitations(skillsDirectory);
  const missingRoutes = citations
    .filter($0 => !contractRoutes.has(routeKey($0.method, $0.path)))
    .map(formatCitation);

  assert.deepEqual(
    {
      citedRouteCount: citations.length,
      hasKnownHealthCitation: citations.some(
        $0 => $0.method === "GET" && $0.path === "/operations/health",
      ),
      missingRoutes,
    },
    {
      citedRouteCount: citations.length,
      hasKnownHealthCitation: true,
      missingRoutes: [],
    },
  );
});

function readOpenApiRoutes(path) {
  const routes = new Set();
  const lines = readFileSync(path, "utf8").split("\n");
  let currentPath;

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);

    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);

    if (currentPath && methodMatch) {
      routes.add(routeKey(methodMatch[1], currentPath));
    }
  }

  return routes;
}

function readSkillRouteCitations(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter($0 => $0.isDirectory())
    .flatMap($0 => readSkillFileRouteCitations(join(directory, $0.name, "SKILL.md")));
}

function readSkillFileRouteCitations(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      Array.from(line.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/[A-Za-z0-9][^\s`),.;]*)/g)).map($0 => ({
        file: relative(projectRoot, path),
        line: index + 1,
        method: $0[1],
        path: $0[2],
      })),
    );
}

function formatCitation(citation) {
  return `${citation.file}:${citation.line} ${citation.method} ${citation.path}`;
}

function routeKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}
