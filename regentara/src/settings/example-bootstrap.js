import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export async function writeSettingsExample(options, fileName, content) {
  const homeDirectory = options.homeDirectory ?? homedir();
  const examplePath = join(homeDirectory, ".regentara", fileName);

  try {
    await mkdir(dirname(examplePath), { recursive: true });
    await writeFile(examplePath, content, { flag: "wx" });
  } catch {}
}
