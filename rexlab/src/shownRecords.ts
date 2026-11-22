import records from "./data/dinosaurs.json";

// The creatures the app shows. A record marked "hidden" is a creature of a
// catalogue batch still being staged (docs/feature-process.md, Catalogue
// batch): it is in the data with its names and texts, but no screen or game
// sees it until the batch's last stage takes the mark off.
export const SHOWN_RECORDS = records.filter((record) => !("hidden" in record && record.hidden === true));
