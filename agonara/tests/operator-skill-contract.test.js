import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { itemQualityBlock, openApiRoutes, routeCitations, routeKey } from "../scripts/skill-contract.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const openApiPath = join(projectRoot, "docs/api/openapi.yml");
const skillsDirectory = join(projectRoot, "skills");

test("operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences", () => {
  const contractRoutes = openApiRoutes(readFileSync(openApiPath, "utf8"));
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
    block: itemQualityBlock(readFileSync(join(skillsDirectory, $0, "SKILL.md"), "utf8")),
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

function readSkillRouteCitations(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter($0 => $0.isDirectory())
    .flatMap($0 => readSkillFileRouteCitations(join(directory, $0.name, "SKILL.md")));
}

function readSkillFileRouteCitations(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      routeCitations(line).map($0 => ({
        file: relative(projectRoot, path),
        line: index + 1,
        method: $0.method,
        path: $0.path,
      })),
    );
}

function formatCitation(citation) {
  return `${citation.file}:${citation.line} ${citation.method} ${citation.path}`;
}
