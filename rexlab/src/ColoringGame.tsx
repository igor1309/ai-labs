import { useCallback, useEffect, useMemo, ViewTransition } from "react";
import { ColoringGalleryScreen } from "./ColoringGalleryScreen.tsx";
import { ColoringWorkshopScreen, type ColoringWorkshopScreenProps } from "./ColoringWorkshopScreen.tsx";
import { coloringGallery, type GallerySource } from "./coloringGallery.ts";
import type { ColoringWorkshopSession, WorkshopNavigation } from "./coloringWorkshop.ts";
import type { Language } from "./language/language.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";

type Phase = { kind: "gallery"; create: boolean } | { kind: "workshop"; session: ColoringWorkshopSession };
export function coloringTransition(from: Phase, to: Phase) { return from === to ? undefined : SCREEN_CHANGE; }
export type ColoringGameProps = {
  source: GallerySource;
  painter: ColoringWorkshopScreenProps["painter"];
  identity(): string;
  countStart(): void;
  home(): void;
  result(navigation: WorkshopNavigation): void;
  language: Language;
};
function GalleryVisit({ source, identity, countStart, home, language, workshop, navigate, create }: ColoringGameProps & {
  workshop(session: ColoringWorkshopSession): void;
  navigate(navigation: WorkshopNavigation): void;
  create: boolean;
}) {
  const session = useMemo(() => coloringGallery({ source, identity, countStart, workshop, navigate }), [source, identity, countStart, workshop, navigate]);
  useEffect(() => { void session.load(create); return session.stop; }, [session, create]);
  return <ColoringGalleryScreen session={session} language={language} home={home} />;
}

// The host supplies home/result routes; the gallery and workshop share the
// production repository without adding an entry to the home screen.
export function ColoringGame(props: ColoringGameProps) {
  const { screen, go } = useScreens<Phase>({ kind: "gallery", create: false }, coloringTransition);
  const { home, result } = props;
  const navigate = useCallback((navigation: WorkshopNavigation) => {
    switch (navigation.destination) {
      case "home": home(); break;
      case "result": result(navigation); break;
      case "gallery": go({ kind: "gallery", create: false }); break;
      case "new": go({ kind: "gallery", create: true }); break;
    }
  }, [go, home, result]);
  const workshop = useCallback((session: ColoringWorkshopSession) => go({ kind: "workshop", session }), [go]);
  return <ViewTransition>{screen.kind === "gallery" ?
    <GalleryVisit {...props} create={screen.create} workshop={workshop} navigate={navigate} /> :
    <ColoringWorkshopScreen key={screen.session.getSnapshot().work.id} session={screen.session} painter={props.painter} language={props.language} />}
  </ViewTransition>;
}
