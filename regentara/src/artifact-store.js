import { access, mkdir, open } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { RuntimeFailure } from "./errors.js";

export async function createAuthoredArtifact(runDirectory, relativePath, content) {
  const artifactPath = safeArtifactPath(runDirectory, relativePath);

  await mkdir(dirname(artifactPath), { recursive: true });

  let fileHandle;
  try {
    fileHandle = await open(artifactPath, "wx");
    await fileHandle.writeFile(content);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new RuntimeFailure(`authored artifact already exists: ${relativePath}`);
    }

    throw error;
  } finally {
    await fileHandle?.close();
  }

  return {
    path: artifactPath,
  };
}

export async function artifactExists(runDirectory, relativePath) {
  try {
    await access(safeArtifactPath(runDirectory, relativePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function safeArtifactPath(runDirectory, relativePath) {
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    throw new RuntimeFailure(`invalid authored artifact path: ${relativePath}`);
  }

  return join(runDirectory, normalizedPath);
}
