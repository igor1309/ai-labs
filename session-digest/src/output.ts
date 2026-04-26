import type * as fs from "node:fs";
import * as path from "node:path";

export type WriteDigestFs = Pick<typeof fs.promises, "mkdir" | "writeFile">;

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
