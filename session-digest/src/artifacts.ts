import type * as fs from "node:fs";
import * as path from "node:path";

export type ArtifactPaths = {
  digestPath: string;
  ledgerPath: string;
};

export type ArtifactCollisionFs = Pick<typeof fs.promises, "access">;

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
