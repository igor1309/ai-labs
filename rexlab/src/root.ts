import type { AppProps } from "./App.tsx";
import digFile from "./data/dig.json";
import records from "./data/dinosaurs.json";
import skeletonPlaces from "./data/skeletons.json";
import { decodedPictures, type DecodingImage } from "./decodedPictures.ts";
import { readDig, type DigFile } from "./dig/index.ts";
import { documentVisibility } from "./documentVisibility.ts";
import { SLIDE_DISTANCE } from "./dinosaurSlide.ts";
import { bodyPictures, skeletonPictures, wholeSkeletons } from "./dinosaurPictures.ts";
import { readCatalogue, readDinosaurs, readPals, readSkeletons, readSortables, readVisitors } from "./dinosaurs.ts";
import { HOME_GAMES } from "./HomePage.tsx";
import { itemPictures } from "./itemPictures.ts";
import { localAgeLevel } from "./localAgeLevel.ts";
import { localLanguage } from "./localLanguage.ts";
import { localCareProgress, localDigProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "./localProgress.ts";
import { localTheme } from "./localTheme.ts";
import { mediaAppearance } from "./mediaAppearance.ts";
import { mediaReducedMotion } from "./mediaMotion.ts";
import { mediaViewport } from "./mediaViewport.ts";
import { pictureStore } from "./Picture.tsx";
import { skeletonSounds } from "./skeletonSounds.ts";
import { tapFilter, type TapInput } from "./tapFilter.ts";
import { TURN_PART, type Box, type PageAnimation, type TurnFrame } from "./turnMotion.ts";

// Every body picture, loaded through Vite so its URL carries a content
// hash. Never inlined, so a picture is cached as a file of its own.
const BODY_PICTURES = import.meta.glob<string>("./assets/dinos/*/body.webp", { eager: true, query: "?url&no-inline", import: "default" });

// Every care picture, loaded the same way.
const CARE_PICTURES = import.meta.glob<string>("./assets/care/*.webp", { eager: true, query: "?url&no-inline", import: "default" });

// Every skeleton picture, the whole skeleton and each of its pieces,
// loaded the same way.
const SKELETON_PICTURES = import.meta.glob<string>("./assets/skeletons/*/*.webp", { eager: true, query: "?url&no-inline", import: "default" });

// The pictures care shows: each item, and the empty bowl of hunger.
const CARE_PICTURE_NAMES = ["plants", "meat", "water", "bath", "nest", "bowl"];

// What the app takes from the browser it runs in.
export type Browser = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  matchMedia(query: string): MediaQueryList;
  getComputedStyle(element: Element): Pick<CSSStyleDeclaration, "getPropertyValue">;
  innerWidth: number;
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
  screen: { orientation?: Pick<ScreenOrientation, "type" | "addEventListener" | "removeEventListener"> };
  navigator: { language: string };
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener" | "querySelectorAll" | "documentElement"> &
    Partial<Pick<Document, "startViewTransition" | "fonts">> & {
      getElementById(id: string): Pick<Element, "setAttribute"> | null;
    };
  Image: new () => DecodingImage;
  setTimeout(fire: () => void, ms: number): number;
  clearTimeout(id: number): void;
  requestAnimationFrame(fire: () => void): number;
  cancelAnimationFrame(id: number): void;
  Date: { now(): number };
  performance: { now(): number };
};

// A screen glides to its other layout over app.css's --motion-standard,
// easing out. Under reduced motion it fades by the root view transition,
// timed by the stylesheet.
export const TURN_TIMING = { glide: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

// A colour that paints nothing, as a browser gives it computed.
const CLEAR = /^(transparent|rgba\(0, 0, 0, 0\))$/;

// Whether `style` paints a frame: a background, a border, an outline or a
// shadow.
function paintsFrame(style: CSSStyleDeclaration): boolean {
  const drawn = (width: string, line: string) => (Number.parseFloat(style.getPropertyValue(width)) || 0) > 0 && style.getPropertyValue(line) !== "none";
  return (
    style.backgroundImage !== "none" ||
    !CLEAR.test(style.backgroundColor) ||
    style.boxShadow !== "none" ||
    drawn("outline-width", "outline-style") ||
    ["top", "right", "bottom", "left"].some((side) => drawn(`border-${side}-width`, `border-${side}-style`))
  );
}

// Draws a part's frame at `box`, under it: a copy of the part alone, none
// of its content, its classes and attributes giving it the part's
// background, border, radius and shadow, which the stylesheet takes off
// the part meanwhile. The part's parent holds the copy where it stands,
// as its scroll moves it, and under each part it holds.
export function turnFrame(element: Element, box: Box): TurnFrame | undefined {
  const view = element.ownerDocument.defaultView;
  const parent = element.parentElement;
  if (!view || !parent || !paintsFrame(view.getComputedStyle(element))) return undefined;
  const copy = element.cloneNode(false) as HTMLElement;
  copy.removeAttribute(TURN_PART);
  copy.removeAttribute("id");
  copy.setAttribute("data-turn-frame", "");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  Object.assign(copy.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    zIndex: "-1",
    margin: "0px",
    boxSizing: "border-box",
    width: `${box.width}px`,
    height: `${box.height}px`,
    minWidth: "0px",
    minHeight: "0px",
    maxWidth: "none",
    maxHeight: "none",
    animation: "none",
    transition: "none",
    pointerEvents: "none"
  });
  parent.setAttribute("data-turn-frames", "");
  element.before(copy);
  // The copy stands at its parent's origin, wherever the part is.
  const origin = copy.getBoundingClientRect();
  copy.style.left = `${box.left - origin.left}px`;
  copy.style.top = `${box.top - origin.top}px`;
  element.setAttribute("data-turn-framed", "");
  return {
    element: copy,
    remove: () => {
      copy.remove();
      element.removeAttribute("data-turn-framed");
      if (![...parent.children].some((child) => child.hasAttribute("data-turn-frame"))) parent.removeAttribute("data-turn-frames");
    }
  };
}

// Widens what a part shows of what it holds, `right` and `bottom` pixels
// past its box: as much padding on those sides, and as much margin off,
// so neither its content nor anything around it moves.
export function extendPart(element: Element, right: number, bottom: number): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view || !(element instanceof HTMLElement)) return () => {};
  const style = view.getComputedStyle(element);
  const px = (property: string) => Number.parseFloat(style.getPropertyValue(property)) || 0;
  const sides = { paddingRight: element.style.paddingRight, paddingBottom: element.style.paddingBottom, marginRight: element.style.marginRight, marginBottom: element.style.marginBottom };
  Object.assign(element.style, {
    paddingRight: `${px("padding-right") + right}px`,
    paddingBottom: `${px("padding-bottom") + bottom}px`,
    marginRight: `${px("margin-right") - right}px`,
    marginBottom: `${px("margin-bottom") - bottom}px`
  });
  return () => Object.assign(element.style, sides);
}

// The animations the page runs on `element` itself, its entrance or a
// transition, that are still running: one finished holds still. An
// endless one has no end to finish at, and goes on.
export function pageAnimations(element: Pick<Element, "getAnimations">): PageAnimation[] {
  return element
    .getAnimations()
    .filter((animation) => animation.playState === "running")
    .map((animation) => ({
      finish: () => {
        if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
      }
    }));
}

// The opacity `element` itself is drawn at, its animations' included.
export function drawnOpacity(element: Element): number {
  const view = element.ownerDocument.defaultView;
  return view ? Number.parseFloat(view.getComputedStyle(element).opacity) : 1;
}

// Each pointer event the double-tap filter reads, and the step of a touch
// it is.
const TOUCH_STEPS = { pointerdown: "press", pointermove: "move", pointerup: "release", pointercancel: "cancel" } as const;

// Puts the double-tap filter before every handler of the app: it listens
// on `target`, the window in a browser, as events go down, so what it
// swallows reaches no handler. Each input is timed by its event's own
// time, never by when it is handled. A click with no detail was made by a
// key or assistive technology. Returns how to take the filter away.
export function filterDoubleTaps(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, filter = tapFilter()): () => void {
  const listen = (type: string, input: (event: Event) => TapInput) => {
    const listener = (event: Event) => {
      if (filter(input(event))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    target.addEventListener(type, listener, { capture: true });
    return () => target.removeEventListener(type, listener, { capture: true });
  };
  const stops = [
    ...Object.entries(TOUCH_STEPS).map(([type, kind]) =>
      listen(type, (event) => {
        const { pointerId, clientX, clientY, timeStamp } = event as PointerEvent;
        return { kind, pointer: pointerId, x: clientX, y: clientY, time: timeStamp };
      })
    ),
    listen("click", (event) => ({ kind: "tap", byKey: (event as MouseEvent).detail === 0 }))
  ];
  return () => stops.forEach((stop) => stop());
}

// Names index.html's version footer, which stands outside the app.
export function versionFooter(document: Browser["document"]): (label: string) => void {
  const footer = document.getElementById("version");
  if (!footer) {
    throw new Error("index.html has no #version element");
  }
  return (label) => footer.setAttribute("aria-label", label);
}

// The app's collaborators in a browser. Progress, start counts and the
// day's featured game, the chosen language, theme and age level outlive
// the visit, so all of them are kept in local storage.
export function appProps(browser: Browser): AppProps {
  const storage = () => browser.localStorage;
  const token = (name: string) => browser.getComputedStyle(browser.document.documentElement).getPropertyValue(name);
  const scrollbarWidth = () => {
    const clientWidth = Number((browser.document.documentElement as HTMLElement).clientWidth);
    return clientWidth > 0 ? Math.max(0, browser.innerWidth - clientWidth) : 0;
  };
  const viewport = mediaViewport(
    (query) => browser.matchMedia(query),
    browser.screen.orientation,
    browser,
    () => browser.getComputedStyle(browser.document.documentElement),
    scrollbarWidth
  );
  const appearance = mediaAppearance((query) => browser.matchMedia(query));
  const visibility = documentVisibility(browser.document);
  const dinosaurs = readDinosaurs(records);
  const skeletons = readSkeletons(records, skeletonPlaces);
  const drawn = wholeSkeletons(SKELETON_PICTURES);
  const featured = localFeatured(storage, HOME_GAMES);
  return {
    dinosaurs,
    catalogue: readCatalogue(records),
    bodyPicture: bodyPictures(BODY_PICTURES, dinosaurs.map(({ id }) => id)),
    random: Math.random,
    viewport,
    portraitLayouts: { home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"], "pairs-result": ["tall"], "sorting-board": ["tall"], "sorting-result": ["tall"], sandWriting: ["tall", "tall-narrow"] },
    pictureMotion: {
      now: () => browser.performance.now(),
      duration: Number.parseFloat(token("--motion-screen")),
      easing: token("--ease-out").trim(),
      slide: {
        duration: Number.parseFloat(token("--motion-standard")),
        delay: Number.parseFloat(token("--motion-stagger")),
        distance: SLIDE_DISTANCE * Number.parseFloat(token("--motion-amount"))
      }
    },
    // A chip's parts as the browser lays them out, which change with no
    // change of the window as the bundled font comes in for the system's.
    chipWidths: {
      width: (part) => part.getBoundingClientRect().width,
      subscribe: (onChange) => {
        browser.document.fonts?.addEventListener("loadingdone", onChange);
        return () => browser.document.fonts?.removeEventListener("loadingdone", onChange);
      }
    },
    // A browser with no view transitions changes the layout at once, and
    // its fade has then ended.
    layoutMotion: {
      parts: browser.document,
      measure: (element) => element.getBoundingClientRect(),
      frame: turnFrame,
      extend: extendPart,
      animate: (element, keyframes, options) => element.animate(keyframes, options),
      animations: pageAnimations,
      opacity: drawnOpacity,
      nextFrame: (fire) => {
        const id = browser.requestAnimationFrame(fire);
        return () => browser.cancelAnimationFrame(id);
      },
      startViewTransition: (update, finished) => {
        if (!browser.document.startViewTransition) {
          update();
          finished();
          return;
        }
        browser.document.startViewTransition(update).finished.then(finished, finished);
      },
      timing: TURN_TIMING
    },
    pageVisibility: { isHidden: visibility.hidden, subscribe: visibility.watch },
    progress: localProgress(storage),
    deviceLanguage: browser.navigator.language,
    languageStore: localLanguage(storage),
    nameVersion: versionFooter(browser.document),
    appearance: { isDark: appearance.dark, subscribe: appearance.watch },
    themeStore: localTheme(storage),
    ageLevelStore: localAgeLevel(storage),
    visitors: readVisitors(records),
    careProgress: localCareProgress(storage),
    sortables: readSortables(records),
    sortingProgress: localSortingProgress(storage),
    pals: readPals(records, drawn),
    pairsProgress: localPairsProgress(storage),
    itemPicture: itemPictures(CARE_PICTURES, CARE_PICTURE_NAMES),
    skeletons,
    skeletonPicture: skeletonPictures(SKELETON_PICTURES, {
      ...Object.fromEntries([...drawn].map((id) => [id, ["skeleton"]])),
      ...Object.fromEntries(skeletons.map(({ id, cuts }) => [id, ["skeleton", ...Object.values(cuts).flatMap((cut) => cut.map((piece) => piece.id))]]))
    }),
    skeletonProgress: localSkeletonProgress(storage),
    skeletonSounds: skeletonSounds(),
    digDinosaurs: readDig(
      dinosaurs.map(({ id }) => id),
      digFile as DigFile
    ),
    digProgress: localDigProgress(storage),
    sandContext: (canvas) => canvas.getContext("2d"),
    reducedMotion: mediaReducedMotion((query) => browser.matchMedia(query)),
    now: () => new Date(browser.Date.now()),
    featuredStore: featured,
    startCounter: featured,
    pictures: pictureStore(decodedPictures(() => new browser.Image())),
    startTimer: (ms, fire) => {
      const id = browser.setTimeout(fire, ms);
      return () => browser.clearTimeout(id);
    }
  };
}
