import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// The app's stylesheet is in every test document, so a test can read the
// computed style a state gives an element. It is read from disk: Vitest
// does not load CSS imports.
const sheet = document.createElement("style");
sheet.textContent = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");
document.head.append(sheet);

afterEach(cleanup);
