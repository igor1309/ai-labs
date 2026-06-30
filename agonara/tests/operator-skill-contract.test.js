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

test("operatorSkills_shouldKeepItemQualityBlockByteIdentical_acrossCuratorAndStudentSkills", () => {
  const sharedBlockSkills = ["agonara-curator-assessment", "agonara-student"];
  const blocks = sharedBlockSkills.map($0 => ({
    skill: $0,
    block: extractItemQualityBlock(join(skillsDirectory, $0, "SKILL.md")),
  }));

  const missingBlocks = blocks.filter($0 => $0.block === null).map($0 => $0.skill);
  const [curator, student] = blocks;

  assert.deepEqual(
    {
      missingBlocks,
      blocksMatch: curator.block !== null && curator.block === student.block,
    },
    {
      missingBlocks: [],
      blocksMatch: true,
    },
  );
});

function extractItemQualityBlock(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex($0 => $0 === "#### The stem");

  if (start === -1) {
    return null;
  }

  // The guarded shared block is the four item-writing subsections — the stem, the
  // distractor rules, the leak-cue rules, and the structure rules — ending at the
  // last line of "#### Structure". Each skill then appends its own closing (the
  // curator's concise cold-read reminder; the student's authored-quiz Definition of
  // Done), which legitimately differ and are not guarded for byte-parity.
  const end = lines.findIndex(
    ($0, index) => index >= start && $0.endsWith("another across the set."),
  );

  if (end === -1) {
    return null;
  }

  return lines.slice(start, end + 1).join("\n");
}

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
