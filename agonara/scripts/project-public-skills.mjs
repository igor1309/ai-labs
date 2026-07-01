// Deterministic projector: renders agonara/skills/ into a staged agonara-skills
// tree (student/ + curator/ role subfolders), per the publish manifest.
// Behavior is added test-first; see tests/public-skills-projection.test.js.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function project({ skillsDir, manifestPath, outDir }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  for (const [bucket, skills] of Object.entries(manifest.buckets)) {
    for (const skill of skills) {
      const dest = join(outDir, bucket, skill, "SKILL.md");
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(skillsDir, skill, "SKILL.md"), dest);
    }
  }
}
