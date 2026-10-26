import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import { project, runCli } from "../scripts/project-public-skills.mjs";

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

  const openapiPath = join(root, "openapi.yml");
  writeFileSync(openapiPath, "paths:\n  /things:\n    get:\n    post:\n  /things/{id}:\n    get:\n");

  return { root, skillsDir, assetsDir, outDir, manifestPath, manifest, openapiPath };
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

// Independent recomputation of the spec R7 canonical tree hash.
function treeHashR7(dir) {
  const serial = listFiles(dir)
    .map($0 => `${$0} ${createHash("sha256").update(readFileSync(join(dir, $0))).digest("hex")}\n`)
    .join("");
  return createHash("sha256").update(serial).digest("hex");
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

test("projectPublicSkills_shouldCopyFoundationsAsByteIdenticalRealFiles_intoBothBuckets", async () => {
  const tree = makeUpstreamTree();

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  const upstream = readFileSync(join(tree.skillsDir, "foundation-one", "SKILL.md"));
  const studentCopy = join(tree.outDir, "student", "foundation-one", "SKILL.md");
  const curatorCopy = join(tree.outDir, "curator", "foundation-one", "SKILL.md");

  assert.deepEqual(readFileSync(studentCopy), upstream);
  assert.deepEqual(readFileSync(curatorCopy), upstream);
  assert.equal(lstatSync(studentCopy).isSymbolicLink(), false);
  assert.equal(lstatSync(curatorCopy).isSymbolicLink(), false);
});

test("projectPublicSkills_shouldScrubDeclaredSectionFromPublishedSkill_keepingSourceIntact", async () => {
  const tree = makeUpstreamTree();
  const sourceSkill = join(tree.skillsDir, "stu-drills", "SKILL.md");
  const sourceBefore = readFileSync(sourceSkill, "utf8");

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  const published = readFileSync(join(tree.outDir, "student", "stu-drills", "SKILL.md"), "utf8");
  assert.equal(published.includes("Body kept."), true, "content outside the section stays");
  assert.equal(published.includes("## References"), false, "the scrubbed heading is gone");
  assert.equal(published.includes("references/secret.md"), false, "no pointer to an unshipped file remains");
  assert.equal(readFileSync(sourceSkill, "utf8"), sourceBefore, "source SKILL.md is untouched");
});

test("projectPublicSkills_shouldPassScanOnCleanTreeButFail_whenAPersonalMarkerReachesOutput", async () => {
  const tree = makeUpstreamTree();
  const opts = {
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  };

  const clean = await project(opts);
  assert.equal(clean.ok, true, "a clean tree passes the scan");

  writeFileSync(
    join(tree.skillsDir, "cur-gamma", "extra.md"),
    "# Extra\n\nrecorded 71/100 last session\n",
  );
  const dirty = await project(opts);
  assert.equal(dirty.ok, false);
  assert.equal(
    dirty.failures.some($0 => $0.rule === "R6" && $0.kind === "personal-marker"),
    true,
  );
});

test("projectPublicSkills_shouldEmitDeterministicProvenanceWithPerTreeHashes_onProjection", async () => {
  const tree = makeUpstreamTree();

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  const prov = JSON.parse(readFileSync(join(tree.outDir, "provenance.json"), "utf8"));

  assert.deepEqual(Object.keys(prov), ["upstreamCommit", "hashAlgo", "trees"]);
  assert.equal(prov.upstreamCommit, SHA);
  assert.equal(prov.hashAlgo, "sha256");
  assert.equal(Object.keys(prov.trees).includes("student/stu-alpha"), true);
  assert.equal(Object.keys(prov.trees).includes("curator/cur-gamma"), true);
  assert.deepEqual(Object.keys(prov.trees), [...Object.keys(prov.trees)].sort());
  assert.equal(
    prov.trees["student/stu-alpha"],
    treeHashR7(join(tree.outDir, "student", "stu-alpha")),
  );
});

test("projectPublicSkills_shouldFailOnDanglingLinkButPassInSubfolderLink_inPublishedSkill", async () => {
  const tree = makeUpstreamTree();
  const opts = {
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  };

  writeFileSync(
    join(tree.skillsDir, "stu-alpha", "SKILL.md"),
    "# Student Alpha\n\nSee [notes](../../research/notes.md).\n",
  );
  const bad = await project(opts);
  assert.equal(bad.ok, false);
  assert.equal(
    bad.failures.some($0 => $0.rule === "R10" && $0.kind === "dangling-link"),
    true,
  );

  writeFileSync(
    join(tree.skillsDir, "stu-alpha", "SKILL.md"),
    "# Student Alpha\n\nBuilds on [foundation](../foundation-one/SKILL.md).\n",
  );
  const good = await project(opts);
  assert.equal(good.failures.some($0 => $0.rule === "R10"), false);
});

test("projectPublicSkills_shouldPassInSubfolderLink_whenOutDirIsRelative", async () => {
  const tree = makeUpstreamTree();
  writeFileSync(
    join(tree.skillsDir, "stu-alpha", "SKILL.md"),
    "# Student Alpha\n\nBuilds on [foundation](../foundation-one/SKILL.md).\n",
  );

  const result = await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: relative(process.cwd(), tree.outDir),
  });

  assert.deepEqual(result.failures, []);
});

test("projectPublicSkills_shouldFailOnRouteCitationAbsentFromOpenApi_butPassWhenPresent", async () => {
  const tree = makeUpstreamTree();
  const opts = {
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    openapiPath: tree.openapiPath,
    upstreamSha: SHA,
    outDir: tree.outDir,
  };

  writeFileSync(join(tree.skillsDir, "stu-alpha", "SKILL.md"), "# A\n\nCall GET /nonexistent.\n");
  const bad = await project(opts);
  assert.equal(bad.ok, false);
  assert.equal(
    bad.failures.some($0 => $0.rule === "R9" && $0.kind === "route-citation"),
    true,
  );

  writeFileSync(join(tree.skillsDir, "stu-alpha", "SKILL.md"), "# A\n\nCall GET /things to list.\n");
  const good = await project(opts);
  assert.equal(good.failures.some($0 => $0.rule === "R9"), false);
});

test("projectPublicSkills_shouldFailWhenGuardedItemQualityBlocksDiverge_acrossPublishedSkills", async () => {
  const tree = makeUpstreamTree();
  const opts = {
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  };
  const block = "#### The stem\n\nKeep distractors plausible to one another across the set.\n";
  writeFileSync(join(tree.skillsDir, "stu-alpha", "SKILL.md"), `# A\n\n${block}`);
  writeFileSync(join(tree.skillsDir, "cur-gamma", "SKILL.md"), `# G\n\n${block}`);

  const matched = await project(opts);
  assert.equal(matched.failures.some($0 => $0.rule === "R9"), false);

  writeFileSync(
    join(tree.skillsDir, "cur-gamma", "SKILL.md"),
    "# G\n\n#### The stem\n\nDifferent rule to one another across the set.\n",
  );
  const diverged = await project(opts);
  assert.equal(diverged.ok, false);
  assert.equal(
    diverged.failures.some($0 => $0.rule === "R9" && $0.kind === "item-quality-parity"),
    true,
  );
});

test("projectPublicSkills_shouldCopyRepoLevelAssetsToStagedRoot_onProjection", async () => {
  const tree = makeUpstreamTree();

  await project({
    skillsDir: tree.skillsDir,
    manifestPath: tree.manifestPath,
    assetsDir: tree.assetsDir,
    upstreamSha: SHA,
    outDir: tree.outDir,
  });

  assert.equal(readFileSync(join(tree.outDir, "README.md"), "utf8"), "# Sample public README\n");
  assert.equal(readFileSync(join(tree.outDir, "LICENSE"), "utf8"), "SAMPLE LICENSE\n");
});

function cliArgs(tree, reportPath) {
  return [
    "--upstream-sha", SHA,
    "--skills-dir", tree.skillsDir,
    "--manifest", tree.manifestPath,
    "--assets", tree.assetsDir,
    "--openapi", tree.openapiPath,
    "--out", tree.outDir,
    "--report", reportPath,
  ];
}

test("runCli_shouldExitZeroAndWriteOkReport_onGreenProjection", async () => {
  const tree = makeUpstreamTree();
  const reportPath = join(tree.root, "report.json");

  const code = await runCli(cliArgs(tree, reportPath));

  assert.equal(code, 0);
  assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).ok, true);
});

test("runCli_shouldExitOneAndReportKind_onGateBreach", async () => {
  const tree = makeUpstreamTree();
  const broken = {
    ...tree.manifest,
    buckets: { ...tree.manifest.buckets, student: [...tree.manifest.buckets.student, "stu-ghost"] },
  };
  writeFileSync(tree.manifestPath, JSON.stringify(broken, null, 2));
  const reportPath = join(tree.root, "report.json");

  const code = await runCli(cliArgs(tree, reportPath));

  assert.equal(code, 1);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.ok, false);
  assert.equal(report.failures.some($0 => $0.kind === "missing-skill"), true);
});

test("runCli_shouldExitTwo_onMissingRequiredFlag", async () => {
  const code = await runCli(["--out", "/tmp/whatever"]);
  assert.equal(code, 2);
});
