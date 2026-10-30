// The font is bundled with the app rather than fetched from a font
// service, so the page looks the same offline and loads nothing from
// elsewhere.
import "@fontsource-variable/lexend";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./app.css";
import { registerWorker } from "./offline/registerWorker.ts";
import { appProps, browserInput } from "./root.ts";
import { InputArbitrationContext } from "./inputArbitration.ts";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no #root element");
}

const input = browserInput(window);
registerWorker(navigator, import.meta.env.PROD, (error) => console.warn("RexLab will not work offline:", error));

createRoot(root).render(
  <StrictMode>
    <InputArbitrationContext value={input.arbitrate}>
      <App {...appProps(window)} />
    </InputArbitrationContext>
  </StrictMode>
);
