import { ViewTransition, type ReactNode } from "react";

// The view transition types of a dinosaur's page opening from its card in
// the catalogue, and closing back to it.
export const OPEN_DINOSAUR = "open-dinosaur";
export const CLOSE_DINOSAUR = "close-dinosaur";

// A dinosaur's picture, the same one on its catalogue card and on its
// page: as the page opens, the card's picture grows into the page's, and
// shrinks back as it closes. The name is the dinosaur's own, so only the
// tapped card's picture is paired; at any other change the picture is
// part of its screen.
export function SharedPicture({ id, children }: { id: string; children: ReactNode }) {
  return (
    <ViewTransition
      name={`dinosaur-${id}`}
      default="none"
      share={{ [OPEN_DINOSAUR]: "dinosaur-share", [CLOSE_DINOSAUR]: "dinosaur-share", default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}
