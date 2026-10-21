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
// each of its pieces. A skeleton of `parts`, by its id, missing one of its
// parts fails here, when the app is put together, rather than as a hole in
// a puzzle.
export function skeletonPictures(files: PictureFiles, parts: Readonly<Record<string, readonly string[]>>): (id: string, part: string) => string {
  const byPart = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const found = SKELETON_PICTURE.exec(path);
    if (found) byPart.set(`${found[1]}/${found[2]}`, url);
  }
  const missing = Object.entries(parts).flatMap(([id, own]) => own.filter((part) => !byPart.has(`${id}/${part}`)).map((part) => `${id}/${part}`));
  if (missing.length > 0) {
    throw new Error(`No skeleton picture for ${missing.join(", ")}`);
  }
  return (id, part) => {
    const url = byPart.get(`${id}/${part}`);
    if (url === undefined) throw new Error(`No skeleton picture for ${id}/${part}`);
    return url;
  };
}

const WHOLE_SKELETON = /(?:^|\/)assets\/skeletons\/([^/]+)\/skeleton\.webp$/;

// The ids of the dinosaurs with a whole skeleton drawn, each at
// `assets/skeletons/<id>/skeleton.webp`, cut into pieces or not.
export function wholeSkeletons(files: PictureFiles): ReadonlySet<string> {
  return new Set(Object.keys(files).flatMap((path) => WHOLE_SKELETON.exec(path)?.[1] ?? []));
}
