import type * as fs from "node:fs";
import * as path from "node:path";

import { SECTION_NAMES, type SectionName } from "./sections.js";

export type WriteDigestFs = Pick<typeof fs.promises, "mkdir" | "writeFile">;

export type FrontMatter = {
  title: string;
  source_path: string;
  provider: string;
  model: string;
  generated_at: Date;
};

export function computeDigestPath(inputPath: string, nowUtc: Date, baseDir: string): string {
  const stem = path.parse(inputPath).name;
  const timestamp = nowUtc.toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "")
    .replace("T", "-")
    .replace("Z", "");

  return path.join(baseDir, `${stem}.${timestamp}.digest.md`);
}

export async function writeDigest(digestPath: string, body: string, fsLike: WriteDigestFs): Promise<void> {
  await fsLike.mkdir(path.dirname(digestPath), { recursive: true });
  await fsLike.writeFile(digestPath, body);
}

export function assembleDigest(frontMatter: FrontMatter, sections: Partial<Record<SectionName, string>>): string {
  const frontMatterBody = [
    "---",
    `title: ${frontMatter.title}`,
    `source_path: ${frontMatter.source_path}`,
    `provider: ${frontMatter.provider}`,
    `model: ${frontMatter.model}`,
    `generated_at: ${formatGeneratedAt(frontMatter.generated_at)}`,
    "---",
    "",
  ].join("\n");
  const sectionBody = SECTION_NAMES.map((sectionName) => `## ${sectionName}\n\n${sections[sectionName] ?? ""}`)
    .join("\n\n");

  return `${frontMatterBody}${sectionBody}\n`;
}

function formatGeneratedAt(generatedAt: Date): string {
  return generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
}
