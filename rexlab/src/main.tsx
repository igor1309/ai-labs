// The font is bundled with the app rather than fetched from a font
// service, so the page looks the same offline and loads nothing from
// elsewhere.
import "@fontsource-variable/lexend";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./app.css";
import { appProps } from "./root.ts";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <App {...appProps(window)} />
  </StrictMode>
);
