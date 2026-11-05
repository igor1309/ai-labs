export type SkeletonScene = {
  draw(width: number, height: number, yaw: number): void;
  dispose(): void;
};

export type SkeletonHeroEnvironment = {
  load(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<SkeletonScene>;
  visible(): boolean;
  reducedMotion(): boolean;
  watchVisibility(change: () => void): () => void;
  watchIntersection(host: HTMLElement, change: (inside: boolean) => void): () => void;
  watchMotion(change: () => void): () => void;
  watchSize(host: HTMLElement, change: (width: number, height: number) => void): () => void;
  requestFrame(draw: (milliseconds: number) => void): number;
  cancelFrame(id: number): void;
};

export const skeletonYaw = (milliseconds: number) => Math.sin(milliseconds * 2 * Math.PI / 10_000) * .1;

// A Home visit owns the renderer. A lost context stays on the picture until
// the next visit, rather than repeatedly allocating a context on a tired GPU.
export function homeSkeletonHero(host: HTMLElement, environment: SkeletonHeroEnvironment): () => void {
  const canvas = host.querySelector("canvas")!;
  const abort = new AbortController();
  let ended = false;
  let failed = false;
  let loading = false;
  let inside = false;
  let width = 0;
  let height = 0;
  let scene: SkeletonScene | undefined;
  let frame: number | undefined;
  let previous: number | undefined;
  let elapsed = 0;
  delete host.dataset.ready;

  const pause = () => {
    if (frame !== undefined) environment.cancelFrame(frame);
    frame = undefined;
    previous = undefined;
  };
  const fail = () => {
    if (ended || failed) return;
    failed = true;
    delete host.dataset.ready;
    pause();
    abort.abort();
    scene?.dispose();
    scene = undefined;
  };
  const active = () => !ended && !failed && inside && environment.visible() && width > 0 && height > 0;
  const paint = () => {
    if (!scene || !active()) return;
    try {
      scene.draw(width, height, environment.reducedMotion() ? 0 : skeletonYaw(elapsed));
      if (!failed) host.dataset.ready = "";
    } catch { fail(); }
  };
  const tick = (milliseconds: number) => {
    frame = undefined;
    if (!active() || environment.reducedMotion()) { previous = undefined; return; }
    if (previous !== undefined) elapsed += Math.max(0, milliseconds - previous);
    previous = milliseconds;
    paint();
    if (active()) frame = environment.requestFrame(tick);
  };
  const update = () => {
    if (!active()) { pause(); return; }
    if (!loading) {
      loading = true;
      // The import and asset fetch start only when this particular hero is seen.
      Promise.resolve().then(() => {
        if (ended || failed) return;
        return environment.load(canvas, abort.signal);
      }).then(loaded => {
        if (!loaded) return;
        if (ended || failed) { loaded.dispose(); return; }
        scene = loaded;
        update();
      }).catch(fail);
    }
    if (!scene) return;
    paint();
    if (environment.reducedMotion()) pause();
    else if (active() && frame === undefined) frame = environment.requestFrame(tick);
  };
  const lost = (event: Event) => { event.preventDefault(); fail(); };
  canvas.addEventListener("webglcontextlost", lost);
  const stops = [
    environment.watchVisibility(update),
    environment.watchMotion(update),
    environment.watchSize(host, (w, h) => { width = w; height = h; update(); }),
    environment.watchIntersection(host, value => { inside = value; update(); })
  ];
  return () => {
    ended = true;
    pause();
    abort.abort();
    stops.forEach(stop => stop());
    canvas.removeEventListener("webglcontextlost", lost);
    scene?.dispose();
    scene = undefined;
    delete host.dataset.ready;
  };
}
