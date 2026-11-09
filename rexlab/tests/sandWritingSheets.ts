import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";

// DRAW brings its own sheet, as it does in the app.
export const SAND_WRITING_SHEETS = ["sandWriting.css"] as const;

if (typeof document !== "undefined") {
  const sheets = document.createElement("style");
  sheets.textContent = appStylesheet(NO_SAFE_AREA, SAND_WRITING_SHEETS);
  document.head.append(sheets);
}
