import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ArrowLeft, Home, Images, LockKeyhole, Paintbrush, Pencil, Plus, RotateCcw, Star, TriangleAlert } from "lucide-react";
import { Button } from "./Button.tsx";
import type { ColoringGallerySession, GalleryWork } from "./coloringGallery.ts";
import type { Language } from "./language/language.ts";
import type { ColoringArtwork } from "./coloring/index.ts";
import { ColoringArtworkPreview } from "./ColoringArtworkPreview.tsx";
import "./coloringGallery.css";

const words = {
  en: { title: "MY ART", home: "HOME", new: "NEW WORK", continue: "CONTINUE", edit: "PAINT", view: "VIEW", draft: "DRAFT", completed: "COMPLETED", empty: "LET’S PAINT A DINOSAUR!", loading: "LOADING", warning: "SOME ART COULDN’T BE LOADED", unavailable: "UNAVAILABLE", retry: "RETRY", recovery: "PARENT RECOVERY", reset: "RESET COLORING", cancel: "CANCEL", close: "BACK", loss: "Resetting deletes all coloring works and earned coloring stars on this device. Other games and settings are kept.", resetError: "COULDN’T RESET", readOnly: "VIEW ONLY" },
  ru: { title: "МОИ РАБОТЫ", home: "ДОМОЙ", new: "НОВЫЙ РИСУНОК", continue: "ПРОДОЛЖИТЬ", edit: "РИСОВАТЬ", view: "СМОТРЕТЬ", draft: "ЧЕРНОВИК", completed: "ГОТОВО", empty: "ДАВАЙ РАСКРАСИМ ДИНОЗАВРА!", loading: "ЗАГРУЖАЕМ", warning: "НЕ ВСЕ РИСУНКИ ЗАГРУЗИЛИСЬ", unavailable: "НЕДОСТУПНО", retry: "ПОВТОРИТЬ", recovery: "ДЛЯ РОДИТЕЛЕЙ", reset: "СБРОСИТЬ РАСКРАСКИ", cancel: "ОТМЕНА", close: "НАЗАД", loss: "Сброс удалит все раскраски и заработанные за них звёзды на этом устройстве. Другие игры и настройки сохранятся.", resetError: "НЕ УДАЛОСЬ СБРОСИТЬ", readOnly: "ТОЛЬКО ПРОСМОТР" }
};
function SavedThumbnail({ record, label, unavailable }: { record: GalleryWork; label: string; unavailable?: () => void }) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState<boolean>(false);
  useEffect(() => {
    const url = URL.createObjectURL(record.thumbnail);
    setImage({ blob: record.thumbnail, url });
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [record.thumbnail]);
  return failed ? <TriangleAlert role="img" aria-label={label} /> :
    <img src={image?.blob === record.thumbnail ? image.url : undefined} alt={label} onError={() => { setFailed(true); unavailable?.(); }} />;
}
function containFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
  if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); }
}
export function ColoringGalleryScreen({ session, language, home, artworks }: { session: ColoringGallerySession; language: Language; home(): void; artworks: readonly ColoringArtwork[] }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const text = words[language];
  const dinosaurName = (version: string) => artworks.find(entry => entry.geometry.artwork.version === version)?.names[language] ?? artworks[0]!.names[language];
  const [failedImages, setFailedImages] = useState<ReadonlyMap<string, Blob>>(new Map());
  const retry = () => { setFailedImages(new Map()); void session.load(); };
  const collection = state.collection;
  const readOnly = collection?.completedCount == null;
  const failedThumbnail = collection?.works.some(record => failedImages.get(record.document.id) === record.thumbnail) ?? false;
  const modal = state.recovery || state.viewing !== null;
  return <section className="coloring-gallery" lang={language} aria-label={text.title}>
    <header inert={modal} className="gallery-header">
      <Button onClick={home}><Home aria-hidden="true" /><span>{text.home}</span></Button>
      <h1><Images aria-hidden="true" />{text.title}</h1>
      {collection?.completedCount !== null && collection && <span className="gallery-count" aria-label={`${text.completed}: ${collection.completedCount}`}><Star aria-hidden="true" />{collection.completedCount}</span>}
    </header>
    <div className="gallery-actions" inert={modal}>
      {artworks.map((artwork, index) => <Button className="gallery-new" key={artwork.geometry.artwork.version}
        aria-label={index === 0 ? text.new : artwork.names[language]} disabled={state.busy || readOnly}
        onClick={() => void session.enter(undefined, index === 0 ? undefined : artwork.geometry.artwork.version)}>
        <ColoringArtworkPreview geometry={artwork.geometry} /><span><Plus aria-hidden="true" />{artwork.names[language]}</span>
      </Button>)}
      {readOnly && collection && <span><LockKeyhole aria-hidden="true" />{text.readOnly}</span>}
    </div>
    <div className="gallery-notices" inert={modal}>
      {state.busy && <p role="status"><RotateCcw aria-hidden="true" />{text.loading}</p>}
      {(state.warning || failedThumbnail) && <div className="gallery-warning" role="alert"><TriangleAlert aria-hidden="true" /><span>{text.warning}</span>
        <Button disabled={state.busy} onClick={retry}><RotateCcw aria-hidden="true" />{text.retry}</Button>
        {readOnly && <Button disabled={state.busy} onClick={session.recover}><LockKeyhole aria-hidden="true" />{text.recovery}</Button>}
      </div>}
    </div>
    <div className="gallery-works" inert={modal} aria-busy={state.busy}>
      {collection && !collection.works.length && !collection.unavailable.length && !state.warning && <div className="gallery-empty"><Paintbrush aria-hidden="true" /><h2>{text.empty}</h2></div>}
      {collection?.works.map((record, index) => {
        const failed = failedImages.get(record.document.id) === record.thumbnail;
        return <article className="gallery-card" key={record.document.id} data-work-id={record.document.id}>
          <div className="gallery-thumbnail">{failed ? <TriangleAlert aria-hidden="true" /> : <SavedThumbnail record={record} label={`${dinosaurName(record.document.geometry)} · ${index + 1}`} unavailable={() => setFailedImages(current => new Map(current).set(record.document.id, record.thumbnail))} />}</div>
          <h2>{failed ? <TriangleAlert aria-hidden="true" /> : record.document.completed ? <Star className="gallery-earned-star" aria-label="★" fill="currentColor" /> : <Pencil aria-hidden="true" />}{failed ? text.unavailable : record.document.completed ? text.completed : text.draft} · {index + 1}</h2>
          <Button disabled={state.busy} onClick={() => failed ? retry() : readOnly ? session.view(record) : void session.enter(record.document.id)}>
            {failed ? <RotateCcw aria-hidden="true" /> : readOnly ? <Images aria-hidden="true" /> : <Paintbrush aria-hidden="true" />}
            {failed ? text.retry : readOnly ? text.view : collection.recentId === record.document.id ? text.continue : text.edit}
          </Button>
        </article>;
      })}
      {collection?.unavailable.map((_, index) => <article className="gallery-card gallery-unavailable" key={`unavailable-${index}`}>
        <div className="gallery-thumbnail"><TriangleAlert aria-hidden="true" /></div><h2>{text.unavailable}</h2>
        <Button disabled={state.busy} onClick={retry}><RotateCcw aria-hidden="true" />{text.retry}</Button>
      </article>)}
    </div>
    {modal && <div className="gallery-overlay"><div className="gallery-dialog" role="dialog" aria-modal="true" aria-label={state.recovery ? text.recovery : text.readOnly} onKeyDown={event => {
      containFocus(event);
      if (event.key === "Escape") { if (state.recovery) session.cancelRecovery(); else session.closeView(); }
    }}>
      {state.recovery ? <>
        <LockKeyhole aria-hidden="true" /><h2>{text.recovery}</h2><p className="gallery-parent-note">{text.loss}</p>
        {state.recoveryError && <p role="alert"><TriangleAlert aria-hidden="true" />{text.resetError}</p>}
        <Button autoFocus disabled={state.busy} onClick={session.cancelRecovery}><ArrowLeft aria-hidden="true" />{text.cancel}</Button>
        <Button disabled={state.busy} onClick={() => void session.reset()}><RotateCcw aria-hidden="true" />{text.reset}</Button>
        <Button onClick={home}><Home aria-hidden="true" />{text.home}</Button>
      </> : state.viewing && <>
        <h2><LockKeyhole aria-hidden="true" />{text.readOnly}</h2>
        <div className="gallery-thumbnail"><SavedThumbnail record={state.viewing} label={dinosaurName(state.viewing.document.geometry)} /></div>
        <Button autoFocus onClick={session.closeView}><ArrowLeft aria-hidden="true" />{text.close}</Button>
        <Button onClick={home}><Home aria-hidden="true" />{text.home}</Button>
      </>}
    </div></div>}
  </section>;
}
