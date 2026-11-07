import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";

// The picture puzzle's screens bring their own sheets, as they do in the
// app, after the dig site's that every BONES and PUZZLE screen shares.
export const PICTURE_PUZZLE_SHEETS = ["skeletonSite.css", "picturePuzzleChoice.css", "picturePuzzleBoard.css", "skeletonResult.css", "picturePuzzleResult.css"] as const;

if (typeof document !== "undefined") {
  const sheets = document.createElement("style");
  sheets.textContent = appStylesheet(NO_SAFE_AREA, PICTURE_PUZZLE_SHEETS);
  document.head.append(sheets);
}
