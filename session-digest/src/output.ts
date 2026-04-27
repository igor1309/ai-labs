import type * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_DIGEST_SCHEMA, type DigestSchema } from "./sections.js";

export type WriteDigestFs = Pick<typeof fs.promises, "mkdir" | "writeFile">;

export type FrontMatter = {
  compressor_strategy?: string;
  compressor_version?: string;
  digest_schema_path?: string;
  digest_schema_version?: number;
  title: string;
  source_path: string;
  provider: string;
  model: string;
  generated_at: Date;
  ledger_path?: string;
  source_bytes?: number;
  source_records?: number;
  ledger_bytes?: number;
  model_context_bytes?: number;
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

export function assembleDigest(
  frontMatter: FrontMatter,
  sections: Partial<Record<string, string>>,
  schema: DigestSchema = DEFAULT_DIGEST_SCHEMA,
): string {
  const frontMatterBody = [
    "---",
    `title: ${frontMatter.title}`,
    `source_path: ${frontMatter.source_path}`,
    `provider: ${frontMatter.provider}`,
    `model: ${frontMatter.model}`,
    `generated_at: ${formatGeneratedAt(frontMatter.generated_at)}`,
    ...optionalFrontMatterLines(frontMatter),
    "---",
    "",
  ].join("\n");
  const sectionBody = schema.sections.map((section) => `## ${section.heading}\n\n${sections[section.id] ?? ""}`)
    .join("\n\n");

  return `${frontMatterBody}${sectionBody}\n`;
}

function formatGeneratedAt(generatedAt: Date): string {
  return generatedAt.toISOString();
}

function optionalFrontMatterLines(frontMatter: FrontMatter): string[] {
  const entries: Array<[keyof FrontMatter, string]> = [
    ["compressor_strategy", "compressor_strategy"],
    ["compressor_version", "compressor_version"],
    ["digest_schema_path", "digest_schema_path"],
    ["digest_schema_version", "digest_schema_version"],
    ["ledger_path", "ledger_path"],
    ["source_bytes", "source_bytes"],
    ["source_records", "source_records"],
    ["ledger_bytes", "ledger_bytes"],
    ["model_context_bytes", "model_context_bytes"],
  ];

  return entries.flatMap(([key, label]) => {
    const value = frontMatter[key];

    return value === undefined ? [] : [`${label}: ${value}`];
  });
}
