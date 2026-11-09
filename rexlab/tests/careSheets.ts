import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";

// CARE's screens bring their own sheets, as they do in the app, after the
// dig site's they share.
export const CARE_SHEETS = ["skeletonSite.css", "careWelcome.css", "careVisit.css", "careResult.css"] as const;

if (typeof document !== "undefined") {
  const sheets = document.createElement("style");
  sheets.textContent = appStylesheet(NO_SAFE_AREA, CARE_SHEETS);
  document.head.append(sheets);
}
