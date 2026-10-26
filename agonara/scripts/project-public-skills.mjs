// Deterministic projector: renders agonara/skills/ into a staged agonara-skills
// tree (student/ + curator/ role subfolders), per the publish manifest.
// Behavior is added test-first; see tests/public-skills-projection.test.js.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { itemQualityBlock, openApiRoutes, routeCitations, routeKey } from "./skill-contract.mjs";

// Relative Markdown link targets in a SKILL.md body (skips absolute URLs and anchors).
function relativeLinkTargets(content) {
  return [...content.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)/g)]
    .map($0 => $0[1].split("#")[0])
    .filter($0 => $0 && !/^[a-z][a-z0-9+.-]*:/i.test($0) && !$0.startsWith("//"));
}

// Heuristic backstop markers for personal data reaching the published output.
const PERSONAL_MARKERS = [/\b\d{1,3}\/100\b/, /\buser-specific\b/i, /\bcalibration\b/i];

function listStagedFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter($0 => $0.isFile())
    .map($0 => relative(dir, join($0.parentPath, $0.name)).split("\\").join("/"));
}

// Canonical, filesystem-order-independent content hash of a projected tree:
// sorted POSIX relpaths, each "<relpath> <sha256hex>\n", hashed together.
function treeHash(dir) {
  const serial = listStagedFiles(dir)
    .sort()
    .map($0 => `${$0} ${createHash("sha256").update(readFileSync(join(dir, $0))).digest("hex")}\n`)
    .join("");
  return createHash("sha256").update(serial).digest("hex");
}

// Remove each declared Markdown section — the heading line through the line before
// the next heading of the same or higher level (or end of file) — from a SKILL.md
// body. Used to strip personal sections from the published copy only.
function scrubSections(content, headings) {
  let lines = content.split("\n");
  for (const heading of headings) {
    const level = (heading.match(/^#+/) || [""])[0].length;
    const start = lines.indexOf(heading);
    if (start === -1) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const marker = lines[i].match(/^(#+)\s/);
      if (marker && marker[1].length <= level) {
        end = i;
        break;
      }
    }
    lines = [...lines.slice(0, start), ...lines.slice(end)];
  }
  return lines.join("\n");
}

export async function project({ skillsDir, manifestPath, assetsDir, outDir, upstreamSha, openapiPath }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ship = manifest.ship || {};
  const scrub = manifest.scrub || {};
  const failures = [];

  const declaredSkills = [
    ...manifest.sharedFoundations,
    ...manifest.buckets.student,
    ...manifest.buckets.curator,
  ];
  for (const skill of declaredSkills) {
    if (!existsSync(join(skillsDir, skill, "SKILL.md"))) {
      failures.push({ rule: "R1", kind: "missing-skill", detail: skill });
    }
  }
  for (const skill of manifest.buckets.student) {
    if (manifest.buckets.curator.includes(skill)) {
      failures.push({ rule: "R3", kind: "both-buckets", detail: skill });
    }
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }

  rmSync(outDir, { recursive: true, force: true });

  const copySkill = (bucket, skill) => {
    for (const rel of ["SKILL.md", ...(ship[skill] || [])]) {
      const src = join(skillsDir, skill, rel);
      const dest = join(outDir, bucket, skill, rel);
      mkdirSync(dirname(dest), { recursive: true });
      if (rel === "SKILL.md" && scrub[skill]) {
        writeFileSync(dest, scrubSections(readFileSync(src, "utf8"), scrub[skill]));
      } else {
        copyFileSync(src, dest);
      }
    }
  };

  const trees = {};
  for (const [bucket, skills] of Object.entries(manifest.buckets)) {
    for (const skill of [...manifest.sharedFoundations, ...skills]) {
      copySkill(bucket, skill);
      trees[`${bucket}/${skill}`] = join(outDir, bucket, skill);
    }
  }

  if (assetsDir) {
    for (const name of readdirSync(assetsDir)) {
      copyFileSync(join(assetsDir, name), join(outDir, name));
    }
  }

  const sortedTrees = {};
  for (const key of Object.keys(trees).sort()) {
    sortedTrees[key] = treeHash(trees[key]);
  }
  const provenance = { upstreamCommit: upstreamSha, hashAlgo: "sha256", trees: sortedTrees };
  writeFileSync(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

  for (const rel of listStagedFiles(outDir)) {
    const text = readFileSync(join(outDir, rel), "utf8");
    if (PERSONAL_MARKERS.some($0 => $0.test(text))) {
      failures.push({ rule: "R6", kind: "personal-marker", detail: rel });
    }
  }

  if (openapiPath) {
    const routes = openApiRoutes(readFileSync(openapiPath, "utf8"));
    for (const rel of listStagedFiles(outDir).filter($0 => $0.endsWith("/SKILL.md"))) {
      for (const cite of routeCitations(readFileSync(join(outDir, rel), "utf8"))) {
        if (!routes.has(routeKey(cite.method, cite.path))) {
          failures.push({ rule: "R9", kind: "route-citation", detail: `${rel} -> ${cite.method} ${cite.path}` });
        }
      }
    }
  }

  const guardedBlocks = listStagedFiles(outDir)
    .filter($0 => $0.endsWith("/SKILL.md"))
    .map($0 => ({ rel: $0, block: itemQualityBlock(readFileSync(join(outDir, $0), "utf8")) }))
    .filter($0 => $0.block !== null);
  for (const other of guardedBlocks.slice(1)) {
    if (other.block !== guardedBlocks[0].block) {
      failures.push({
        rule: "R9",
        kind: "item-quality-parity",
        detail: `${guardedBlocks[0].rel} vs ${other.rel}`,
      });
    }
  }

  for (const rel of listStagedFiles(outDir).filter($0 => $0.endsWith("/SKILL.md"))) {
    const bucket = rel.split("/")[0];
    const roleRoot = resolve(outDir, bucket);
    const skillPath = join(outDir, rel);
    for (const link of relativeLinkTargets(readFileSync(skillPath, "utf8"))) {
      const target = resolve(dirname(skillPath), link);
      const inRole = target === roleRoot || target.startsWith(roleRoot + sep);
      if (!inRole || !existsSync(target)) {
        failures.push({ rule: "R10", kind: "dangling-link", detail: `${rel} -> ${link}` });
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

const REQUIRED_FLAGS = ["upstream-sha", "skills-dir", "manifest", "assets", "out"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || i + 1 >= argv.length) {
      return null;
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function writeReport(target, report) {
  if (!target) return;
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (target === "-") {
    process.stdout.write(json);
  } else {
    writeFileSync(target, json);
  }
}

// CLI wrapper: exit 0 (all gates pass), 1 (gate breach), 2 (usage/IO error).
export async function runCli(argv) {
  const args = parseArgs(argv);
  if (!args || REQUIRED_FLAGS.some($0 => !args[$0])) {
    return 2;
  }
  try {
    const result = await project({
      skillsDir: args["skills-dir"],
      manifestPath: args.manifest,
      assetsDir: args.assets,
      openapiPath: args.openapi,
      outDir: args.out,
      upstreamSha: args["upstream-sha"],
    });
    writeReport(args.report, result);
    return result.ok ? 0 : 1;
  } catch (error) {
    writeReport(args.report, {
      ok: false,
      failures: [{ rule: "CLI", kind: "error", detail: String(error && error.message) }],
    });
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli(process.argv.slice(2)).then($0 => process.exit($0));
}
