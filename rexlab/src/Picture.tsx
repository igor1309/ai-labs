import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StartTimer } from "./ownedTimers.ts";

// docs/features/pictures.feature: a screen never waits for its pictures.

// How loading a picture ended.
export type PictureOutcome = "loaded" | "failed";

// Loads the picture at `url` and calls `done` once, when it has loaded or
// failed to, saying which. Only the store loads pictures: nothing else
// takes one (docs/tap-safety.md).
export type LoadPicture = (url: string, done: (outcome: PictureOutcome) => void) => void;

// Where a picture's loading is: asked for and not yet ended, or how it
// ended.
export type PictureStatus = "loading" | PictureOutcome;

// Every picture since the app was opened and where its loading is. Each
// is loaded once, however many places show it or ask for it ahead; one
// that failed is loaded again when asked for again.
export type PictureStore = {
  request(url: string): void;
  status(url: string): PictureStatus | undefined;
  subscribe(listener: () => void): () => void;
};

export function pictureStore(loadPicture: LoadPicture): PictureStore {
  const statuses = new Map<string, PictureStatus>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  return {
    request: (url) => {
      const status = statuses.get(url);
      if (status === "loading" || status === "loaded") return;
      statuses.set(url, "loading");
      if (status === "failed") changed();
      loadPicture(url, (outcome) => {
        statuses.set(url, outcome);
        changed();
      });
    },
    status: (url) => statuses.get(url),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// How long a picture may load before its place shows the failure look.
export const PICTURE_LIMIT = 8000;

type Pictures = { store: PictureStore; startTimer: StartTimer };

const PicturesContext = createContext<Pictures | undefined>(undefined);

// Gives every picture under it the app's pictures and timer.
export function PicturesProvider({ store, startTimer, children }: Pictures & { children: ReactNode }) {
  const [pictures] = useState<Pictures>(() => ({ store, startTimer }));
  return <PicturesContext value={pictures}>{children}</PicturesContext>;
}

function usePictures(): Pictures {
  const pictures = useContext(PicturesContext);
  if (!pictures) throw new Error("A picture is shown outside PicturesProvider");
  return pictures;
}

// What a picture's place shows: its shimmer, the failure look, the
// picture fading in as it arrives, or the picture already there.
export type PictureLook = "loading" | "failed" | "appearing" | "shown";

export type PictureProps = {
  src: string;
  alt: string;
  className: string;
  width?: number;
  height?: number;
  // The picture's name as a part a turn glides, where it is one.
  part?: string;
};

// The look of a place showing `src`, which it asks for. Its source is
// given to the image only once loaded and decoded, so it never draws in
// part; until then the place shimmers, for up to PICTURE_LIMIT from when
// it first showed this source.
export function usePicture(src: string): PictureLook {
  const { store, startTimer } = usePictures();
  // A picture not yet asked for is loading: this place asks for it.
  const status = useSyncExternalStore(store.subscribe, () => store.status(src) ?? "loading");
  // The source this place saw loading, so it fades in as it arrives, and
  // the source whose limit ran out.
  const [waited, setWaited] = useState<string>();
  const [late, setLate] = useState<string>();

  if (status === "loading" && waited !== src) setWaited(src);

  useEffect(() => store.request(src), [store, src]);
  useEffect(() => {
    if (status !== "loading") return;
    return startTimer(PICTURE_LIMIT, () => setLate(src));
  }, [startTimer, src, status]);

  return status === "loaded" ? (waited === src ? "appearing" : "shown") : status === "failed" || late === src ? "failed" : "loading";
}

// A picture's place in the look given, for a place that shows more
// than its picture as the look changes; any other uses `<Picture>`.
export function PictureImage({ look, src, alt, className, width, height, part }: PictureProps & { look: PictureLook }) {
  const loaded = look === "appearing" || look === "shown";
  return (
    <img
      className={`picture ${className}`}
      data-picture={look}
      data-turn-part={part}
      {...(loaded ? { src } : {})}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
    />
  );
}

// A picture, its place laid out from the first render.
export function Picture(props: PictureProps) {
  return <PictureImage look={usePicture(props.src)} {...props} />;
}

// Starts loading pictures a screen may show next, so they are ready when
// it does.
export function LoadAhead({ urls }: { urls: readonly string[] }) {
  const { store } = usePictures();
  // Asking again for a picture asked for does nothing; the effect runs
  // again only when the pictures change.
  const key = urls.join("\n");
  useEffect(() => {
    for (const url of key.split("\n").filter(Boolean)) store.request(url);
  }, [store, key]);
  return null;
}
