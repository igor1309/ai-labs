// Deterministic projector: renders agonara/skills/ into a staged agonara-skills
// tree (student/ + curator/ role subfolders), per the publish manifest.
// Behavior is added test-first; see tests/public-skills-projection.test.js.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export async function project({ skillsDir, manifestPath, outDir }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ship = manifest.ship || {};
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
      const dest = join(outDir, bucket, skill, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(skillsDir, skill, rel), dest);
    }
  };

  for (const [bucket, skills] of Object.entries(manifest.buckets)) {
    for (const skill of [...manifest.sharedFoundations, ...skills]) {
      copySkill(bucket, skill);
    }
  }

  return { ok: true, failures: [] };
}
