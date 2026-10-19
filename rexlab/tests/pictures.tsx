import type { ReactNode } from "react";
import { PicturesProvider } from "../src/Picture.tsx";
import { loadedPictures, type ManualPictures } from "./support.ts";

// Every picture loaded the moment it is asked for, for a screen rendered
// on its own, outside the app: render(<Screen />, withPictures).
function LoadedPictures({ children }: { children: ReactNode }) {
  const { pictures, startTimer } = loadedPictures();
  return (
    <PicturesProvider store={pictures} startTimer={startTimer}>
      {children}
    </PicturesProvider>
  );
}

export const withPictures = { wrapper: LoadedPictures };

// Pictures that load only as `pictures` says, for a screen rendered on its
// own: render(<Screen />, withManualPictures(pictures)).
export function withManualPictures(pictures: ManualPictures) {
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PicturesProvider store={pictures.pictures} startTimer={pictures.startTimer}>
        {children}
      </PicturesProvider>
    )
  };
}
