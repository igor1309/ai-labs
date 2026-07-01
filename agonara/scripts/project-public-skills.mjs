// Deterministic projector: renders agonara/skills/ into a staged agonara-skills
// tree (student/ + curator/ role subfolders), per the publish manifest.
// Behavior is added test-first; see tests/public-skills-projection.test.js.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// Heuristic backstop markers for personal data reaching the published output.
const PERSONAL_MARKERS = [/\b\d{1,3}\/100\b/, /\buser-specific\b/i, /\bcalibration\b/i];

function listStagedFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter($0 => $0.isFile())
    .map($0 => relative(dir, join($0.parentPath, $0.name)));
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

export async function project({ skillsDir, manifestPath, outDir }) {
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

  for (const [bucket, skills] of Object.entries(manifest.buckets)) {
    for (const skill of [...manifest.sharedFoundations, ...skills]) {
      copySkill(bucket, skill);
    }
  }

  for (const rel of listStagedFiles(outDir)) {
    const text = readFileSync(join(outDir, rel), "utf8");
    if (PERSONAL_MARKERS.some($0 => $0.test(text))) {
      failures.push({ rule: "R6", kind: "personal-marker", detail: rel.split("\\").join("/") });
    }
  }

  return { ok: failures.length === 0, failures };
}
