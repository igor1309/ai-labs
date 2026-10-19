import type { ReactNode } from "react";
import { pictureStore, PicturesProvider } from "../src/Picture.tsx";
import { loadedPictures, type ManualPictures } from "./support.ts";

// Every picture loaded the moment it is asked for, for a screen rendered
// on its own, outside the app: render(<Screen />, withPictures).
function LoadedPictures({ children }: { children: ReactNode }) {
  const { loadPicture, startTimer } = loadedPictures();
  return (
    <PicturesProvider store={pictureStore(loadPicture)} startTimer={startTimer}>
      {children}
    </PicturesProvider>
  );
}

export const withPictures = { wrapper: LoadedPictures };

// Pictures that load only as `pictures` says, for a screen rendered on its
// own: render(<Screen />, withManualPictures(pictures)).
export function withManualPictures(pictures: ManualPictures) {
  const store = pictureStore(pictures.loadPicture);
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PicturesProvider store={store} startTimer={pictures.startTimer}>
        {children}
      </PicturesProvider>
    )
  };
}
