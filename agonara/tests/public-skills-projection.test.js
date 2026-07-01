import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
