import { useCallback, useEffect, useMemo, useSyncExternalStore, ViewTransition } from "react";
import { ColoringGalleryScreen } from "./ColoringGalleryScreen.tsx";
import { ColoringResultScreen } from "./ColoringResultScreen.tsx";
import { ColoringWorkshopScreen, type ColoringWorkshopScreenProps } from "./ColoringWorkshopScreen.tsx";
import { coloringGallery, type GallerySource } from "./coloringGallery.ts";
import { coloringResult } from "./coloringResult.ts";
import type { ColoringWorkshopSession, WorkshopNavigation } from "./coloringWorkshop.ts";
import type { ColoringArtwork } from "./coloring/index.ts";
import type { Language } from "./language/language.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";

type Result = Extract<WorkshopNavigation, { destination: "result" }>;
type Phase = { kind: "gallery"; create: boolean | string } | { kind: "workshop"; session: ColoringWorkshopSession } | { kind: "result"; result: Result };
export function coloringTransition(from: Phase, to: Phase) { return from === to ? undefined : SCREEN_CHANGE; }
export type ColoringGameProps = {
  source: GallerySource;
  artworks: readonly ColoringArtwork[];
  painter: ColoringWorkshopScreenProps["painter"];
  painterFor?(geometry: string): ColoringWorkshopScreenProps["painter"];
  identity(): string;
  countStart(): void;
  home(): void;
  language: Language;
};
function GalleryVisit({ source, identity, countStart, home, language, workshop, navigate, create, artworks }: ColoringGameProps & {
  workshop(session: ColoringWorkshopSession): void;
  navigate(navigation: WorkshopNavigation): void;
  create: boolean | string;
}) {
  const session = useMemo(() => coloringGallery({ source, identity, countStart, workshop, navigate }), [source, identity, countStart, workshop, navigate]);
  useEffect(() => { void session.load(create); return session.stop; }, [session, create]);
  return <ColoringGalleryScreen artworks={artworks} session={session} language={language} home={home} />;
}

function ResultVisit({ result, source, painter, language, home, workshop, navigate, artworks }: Omit<ColoringGameProps, "identity" | "countStart"> & {
  result: Result;
  workshop(session: ColoringWorkshopSession): void;
  navigate(navigation: WorkshopNavigation): void;
}) {
  const session = useMemo(() => coloringResult(result.work.id, { open: (id, callback) => source.open(id, callback), workshop, navigate,
    leave: destination => destination === "home" ? home() : navigate({ destination, work: result.work })
  }), [result, source, workshop, navigate, home]);
  useEffect(() => { session.start(); return session.stop; }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <ColoringResultScreen dinosaur={artworks.find(entry => entry.geometry.artwork.version === result.work.geometry)?.names[language]} work={result.work} completion={result.completion} painter={painter} language={language} {...state} choose={action => { void session.choose(action); }} />;
}

// All coloring screens share the production repository; the host supplies HOME.
export function ColoringGame(props: ColoringGameProps) {
  const { screen, go } = useScreens<Phase>({ kind: "gallery", create: false }, coloringTransition);
  const { home } = props;
  const navigate = useCallback((navigation: WorkshopNavigation) => {
    switch (navigation.destination) {
      case "home": home(); break;
      case "result": go({ kind: "result", result: navigation }); break;
      case "gallery": go({ kind: "gallery", create: false }); break;
      case "new": go({ kind: "gallery", create: navigation.work.geometry }); break;
    }
  }, [go, home]);
  const workshop = useCallback((session: ColoringWorkshopSession) => go({ kind: "workshop", session }), [go]);
  return <ViewTransition>{screen.kind === "gallery" ?
    <GalleryVisit {...props} create={screen.create} workshop={workshop} navigate={navigate} /> :
    screen.kind === "result" ? <ResultVisit {...props} painter={props.painterFor?.(screen.result.work.geometry) ?? props.painter} result={screen.result} workshop={workshop} navigate={navigate} /> :
    <ColoringWorkshopScreen key={screen.session.getSnapshot().work.id} session={screen.session} dinosaur={props.artworks.find(entry => entry.geometry.artwork.version === screen.session.getSnapshot().work.geometry)?.names[props.language]} painter={props.painterFor?.(screen.session.getSnapshot().work.geometry) ?? props.painter} language={props.language} />}
  </ViewTransition>;
}
