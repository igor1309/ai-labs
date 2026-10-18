import type { ReactNode } from "react";
import { pictureStore, PicturesProvider } from "../src/Picture.tsx";
import { loadedPictures } from "./support.ts";

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
