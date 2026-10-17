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
