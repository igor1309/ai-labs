import type { PictureFiles } from "./dinosaurPictures.ts";

const ITEM_PICTURE = /(?:^|\/)assets\/care\/([^/]+)\.webp$/;

// Each care picture, by its name, from the files at
// `assets/care/<name>.webp`. A name in `names` with no picture fails here,
// when the app is put together, rather than as an empty button mid-visit.
export function itemPictures(files: PictureFiles, names: readonly string[]): (name: string) => string {
  const byName = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const name = ITEM_PICTURE.exec(path)?.[1];
    if (name !== undefined) byName.set(name, url);
  }
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`No care picture for ${missing.join(", ")}`);
  }
  return (name) => {
    const url = byName.get(name);
    if (url === undefined) throw new Error(`No care picture for ${name}`);
    return url;
  };
}
