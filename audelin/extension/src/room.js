// The Telemost room a page shows: the 14-digit number at the start of its
// path (/j/<room>), or null on any other Telemost page. Telemost moves
// between its pages without loading a new document, so the caller reads it
// from the current address each time.
export function roomOf(pathname) {
  return pathname.match(/^\/j\/([0-9]{14})(?:[/?#]|$)/)?.[1] ?? null;
}
