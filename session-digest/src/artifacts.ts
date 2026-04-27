import type * as fs from "node:fs";
import * as path from "node:path";

export type ArtifactPaths = {
  digestPath: string;
  ledgerPath: string;
};

export type ArtifactCollisionFs = Pick<typeof fs.promises, "access">;
export type LedgerWriteFs = Pick<typeof fs.promises, "mkdir" | "stat" | "writeFile">;

export class ArtifactCollisionError extends Error {}

export function computeArtifactPaths(inputPath: string, nowUtc: Date, baseDir: string): ArtifactPaths {
  const stem = path.parse(inputPath).name;
  const timestamp = nowUtc.toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "")
    .replace("T", "-")
    .replace("Z", "");

  return {
    digestPath: path.join(baseDir, `${stem}.${timestamp}.digest.md`),
    ledgerPath: path.join(baseDir, `${stem}.${timestamp}.ledger.json`),
  };
}

export async function assertArtifactPathsAvailable(paths: ArtifactPaths, fsLike: ArtifactCollisionFs): Promise<void> {
  for (const artifactPath of [paths.digestPath, paths.ledgerPath]) {
    if (await exists(artifactPath, fsLike)) {
      throw new ArtifactCollisionError(`Artifact already exists: ${artifactPath}`);
    }
  }
}

export async function assertLedgerPathAvailable(paths: ArtifactPaths, fsLike: ArtifactCollisionFs): Promise<void> {
  if (await exists(paths.ledgerPath, fsLike)) {
    throw new ArtifactCollisionError(`Artifact already exists: ${paths.ledgerPath}`);
  }
}

export async function writeLedger(ledgerPath: string, ledger: unknown, fsLike: LedgerWriteFs): Promise<void> {
  await fsLike.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fsLike.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

export async function measureLedgerBytes(ledgerPath: string, fsLike: LedgerWriteFs): Promise<number> {
  return (await fsLike.stat(ledgerPath)).size;
}

async function exists(artifactPath: string, fsLike: ArtifactCollisionFs): Promise<boolean> {
  try {
    await fsLike.access(artifactPath);

    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
