// The picture files Vite gives, each by its path under src/ and the URL it
// is served at.
export type PictureFiles = Readonly<Record<string, string>>;

const BODY_PICTURE = /(?:^|\/)assets\/dinos\/([^/]+)\/body\.webp$/;

// Each dinosaur's body picture, by the dinosaur's id, from the files at
// `assets/dinos/<id>/body.webp`. A dinosaur in `ids` with no picture fails
// here, when the app is put together, rather than as a broken image on a
// card mid-round.
export function bodyPictures(files: PictureFiles, ids: readonly string[]): (id: string) => string {
  const byId = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const id = BODY_PICTURE.exec(path)?.[1];
    if (id !== undefined) byId.set(id, url);
  }
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`No body picture for ${missing.join(", ")}`);
  }
  return (id) => {
    const url = byId.get(id);
    if (url === undefined) throw new Error(`No body picture for ${id}`);
    return url;
  };
}

const SKELETON_PICTURE = /(?:^|\/)assets\/skeletons\/([^/]+)\/([^/]+)\.webp$/;

// Each skeleton's pictures, by the dinosaur's id and the part's name, from
// the files at `assets/skeletons/<id>/<part>.webp`: the whole skeleton and
// each of its pieces. A skeleton in `ids` missing one of `parts` fails
// here, when the app is put together, rather than as a hole in a puzzle.
export function skeletonPictures<Part extends string>(files: PictureFiles, ids: readonly string[], parts: readonly Part[]): (id: string, part: Part) => string {
  const byPart = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const found = SKELETON_PICTURE.exec(path);
    if (found) byPart.set(`${found[1]}/${found[2]}`, url);
  }
  const missing = ids.flatMap((id) => parts.filter((part) => !byPart.has(`${id}/${part}`)).map((part) => `${id}/${part}`));
  if (missing.length > 0) {
    throw new Error(`No skeleton picture for ${missing.join(", ")}`);
  }
  return (id, part) => {
    const url = byPart.get(`${id}/${part}`);
    if (url === undefined) throw new Error(`No skeleton picture for ${id}/${part}`);
    return url;
  };
}
