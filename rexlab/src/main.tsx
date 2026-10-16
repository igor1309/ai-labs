import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./app.css";
import records from "./data/dinosaurs.json";
import { readDinosaurs } from "./dinosaurs.ts";
import { mediaOrientation } from "./mediaOrientation.ts";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <App dinosaurs={readDinosaurs(records)} random={Math.random} orientation={mediaOrientation(window.matchMedia.bind(window))} />
  </StrictMode>
);
