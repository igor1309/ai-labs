import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import { project } from "../scripts/project-public-skills.mjs";

// A synthetic upstream tree + manifest + assets, decoupled from real skill names,
// exercising foundations, ship extras, an unshipped personal reference, a scrub
// section, and an unbucketed skill.
function makeUpstreamTree() {
  const root = mkdtempSync(join(tmpdir(), "aps-"));
  const skillsDir = join(root, "skills");
  const assetsDir = join(root, "assets");
  const outDir = join(root, "out");

  const put = (path, body) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };

  put(join(skillsDir, "foundation-one", "SKILL.md"), "# Foundation One\n");
  put(join(skillsDir, "foundation-two", "SKILL.md"), "# Foundation Two\n");
  put(join(skillsDir, "stu-alpha", "SKILL.md"), "# Student Alpha\n");
  put(
    join(skillsDir, "stu-drills", "SKILL.md"),
    "# Student Drills\n\nBody kept.\n\n## References\n\n- references/secret.md — private cues.\n",
  );
  put(join(skillsDir, "stu-drills", "references", "keep.md"), "# Keep — product\n");
  put(join(skillsDir, "stu-drills", "references", "secret.md"), "# Secret — 71/100\n");
  put(join(skillsDir, "cur-gamma", "SKILL.md"), "# Curator Gamma\n");
  put(join(skillsDir, "cur-gamma", "extra.md"), "# Curator extra — product\n");
  put(join(skillsDir, "admin-x", "SKILL.md"), "# Admin X (unbucketed)\n");

  const manifest = {
    sharedFoundations: ["foundation-one", "foundation-two"],
    buckets: {
      student: ["stu-alpha", "stu-drills"],
      curator: ["cur-gamma"],
    },
    ship: {
      "stu-drills": ["references/keep.md"],
      "cur-gamma": ["extra.md"],
    },
    scrub: {
      "stu-drills": ["## References"],
    },
  };
  const manifestPath = join(root, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  put(join(assetsDir, "README.md"), "# Sample public README\n");
  put(join(assetsDir, "LICENSE"), "SAMPLE LICENSE\n");

  return { root, skillsDir, assetsDir, outDir, manifestPath, manifest };
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter($0 => $0.isFile())
    .map($0 => relative(dir, join($0.parentPath, $0.name)).split("\\").join("/"))
    .sort();
}

function hashTree(dir) {
  return listFiles(dir)
    .map($0 => `${$0} ${createHash("sha256").update(readFileSync(join(dir, $0))).digest("hex")}`)
    .join("\n");
}

const SHA = "a".repeat(40);

test("projectPublicSkills_shouldWriteEachBucketSkillIntoItsRoleSubfolder_onProjection", async () => {
  const tree = makeUpstreamTree();

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  assert.equal(existsSync(join(tree.outDir, "student", "stu-alpha", "SKILL.md")), true);
  assert.equal(existsSync(join(tree.outDir, "curator", "cur-gamma", "SKILL.md")), true);
});

test("projectPublicSkills_shouldStageExactlyTheAllowlistPayload_onProjection", async () => {
  const tree = makeUpstreamTree();

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  const payload = [
    ...listFiles(join(tree.outDir, "student")).map($0 => `student/${$0}`),
    ...listFiles(join(tree.outDir, "curator")).map($0 => `curator/${$0}`),
  ].sort();

  assert.deepEqual(payload, [
    "curator/cur-gamma/SKILL.md",
    "curator/cur-gamma/extra.md",
    "curator/foundation-one/SKILL.md",
    "curator/foundation-two/SKILL.md",
    "student/foundation-one/SKILL.md",
    "student/foundation-two/SKILL.md",
    "student/stu-alpha/SKILL.md",
    "student/stu-drills/SKILL.md",
    "student/stu-drills/references/keep.md",
  ]);
});

test("projectPublicSkills_shouldRebuildFromCleanStagingAndBeByteIdentical_onRerun", async () => {
  const tree = makeUpstreamTree();
  const stray = join(tree.outDir, "student", "STALE.md");
  mkdirSync(dirname(stray), { recursive: true });
  writeFileSync(stray, "stale");

  const opts = {
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  };
  await project(opts);

  assert.equal(existsSync(stray), false, "stale file from a prior run must not survive");

  const first = hashTree(tree.outDir);
  await project(opts);
  assert.equal(hashTree(tree.outDir), first, "reruns must be byte-identical");
});

test("projectPublicSkills_shouldFailClosed_whenADeclaredSkillIsAbsentFromSource", async () => {
  const tree = makeUpstreamTree();
  const broken = {
    ...tree.manifest,
    buckets: { ...tree.manifest.buckets, student: [...tree.manifest.buckets.student, "stu-ghost"] },
  };
  writeFileSync(tree.manifestPath, JSON.stringify(broken, null, 2));

  const result = await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.failures.some($0 => $0.rule === "R1" && $0.detail.includes("stu-ghost")),
    true,
  );
});

test("projectPublicSkills_shouldFailClosed_whenASkillIsInBothNonFoundationBuckets", async () => {
  const tree = makeUpstreamTree();
  const broken = {
    ...tree.manifest,
    buckets: {
      student: [...tree.manifest.buckets.student, "cur-gamma"],
      curator: tree.manifest.buckets.curator,
    },
  };
  writeFileSync(tree.manifestPath, JSON.stringify(broken, null, 2));

  const result = await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.failures.some($0 => $0.rule === "R3" && $0.detail.includes("cur-gamma")),
    true,
  );
});
