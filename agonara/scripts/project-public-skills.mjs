// Deterministic projector: renders agonara/skills/ into a staged agonara-skills
// tree (student/ + curator/ role subfolders), per the publish manifest.
// Behavior is added test-first; see tests/public-skills-projection.test.js.

import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export async function project({ skillsDir, manifestPath, outDir }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ship = manifest.ship || {};

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
}
