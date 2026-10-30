import "@fontsource-variable/lexend";
import "./probe.css";
import { filterDoubleTaps } from "../root.ts";
import { COLORS, HEIGHT, SIZES, WIDTH, type Point } from "./geometry.ts";
import { append, newWork, readRecord, undo, type Action, type Work } from "./model.ts";
import { createPainter } from "./painter.ts";
import { indexedWorks } from "./store.ts";
import { workSession, type Session } from "./session.ts";
import { gesture } from "./gesture.ts";

const host = document.querySelector<HTMLDivElement>("#probe")!;
host.innerHTML = `<header><h1></h1><button id="language"></button><button id="theme"></button></header><div id="notice" role="status"><span id="status"></span><button id="retry" hidden></button></div><section id="stage"><canvas id="drawing" width="1024" height="768" aria-label="STEGOSAURUS"></canvas><div id="sheet" hidden><div id="sheet-head"><button id="close"></button><button id="new"></button><button id="reload"></button></div><div id="choices"></div></div></section><nav></nav>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drawing = get<HTMLCanvasElement>("drawing");
const sheet = get("sheet"), choices = get("choices");
const painter = createPainter(() => document.createElement("canvas"));
const committed = painter.canvas();
const store = indexedWorks({ open: (name, version) => window.indexedDB.open(name, version) }, "rexlab-coloring-probe-1");
const sessions = new Map<string, Session>();
const unavailable = new Map<string, string>();
const thumbs = new Map<string, Blob>();
const urls: string[] = [];
const contact = gesture();
let activePointer: number | undefined, contactTool: "stroke" | "fill" = "stroke";
let language = navigator.language.startsWith("ru") ? "ru" : "en";
let dark = matchMedia("(prefers-color-scheme: dark)").matches;
let current: Session | undefined;
let color: string = COLORS[1], size: number = SIZES[1], tool: "stroke" | "fill" = "stroke", alive = false;
let panel: "colors" | "sizes" | "works" | undefined;
let readError = "", loading = false;
const words = {
  en: { title: "🦕 COLORING · PROTOTYPE", colors: "COLOR", sizes: "SIZE", stroke: "BRUSH", fill: "FILL", undo: "UNDO", alive: "ANIMATE", stop: "EDIT", works: "WORKS", close: "✕ CLOSE", new: "＋ NEW", reload: "↻ READ", retry: "↻ RETRY", saved: "✓ SAVED", saving: "◷ SAVING", unsaved: "○ NEW WORK", error: "⚠ SAVE FAILED", read: "⚠ READ FAILED", locked: "⚠ UNAVAILABLE", loading: "◷ READING", empty: "＋ CHOOSE NEW" },
  ru: { title: "🦕 РАСКРАСКА · ПРОТОТИП", colors: "ЦВЕТ", sizes: "РАЗМЕР", stroke: "КИСТЬ", fill: "ЗАЛИВКА", undo: "ОТМЕНА", alive: "ОЖИВИТЬ", stop: "РИСОВАТЬ", works: "РАБОТЫ", close: "✕ ЗАКРЫТЬ", new: "＋ НОВАЯ", reload: "↻ ЧИТАТЬ", retry: "↻ ПОВТОР", saved: "✓ СОХРАНЕНО", saving: "◷ СОХРАНЯЕМ", unsaved: "○ НОВАЯ РАБОТА", error: "⚠ НЕ СОХРАНЕНО", read: "⚠ ОШИБКА ЧТЕНИЯ", locked: "⚠ НЕДОСТУПНО", loading: "◷ ЧИТАЕМ", empty: "＋ СОЗДАЙ РАБОТУ" }
};
const text = () => words[language as "en" | "ru"];
const button = (label: string, run: () => void) => {
  const result = document.createElement("button"); result.textContent = label;
  result.onclick = () => { if (!contact.busy) run(); }; return result;
};
const snapshotThumbnail = async (work: Work) => {
  const canvas = painter.canvas(); painter.render(canvas, work.actions);
  return painter.thumbnail(canvas);
};
function attach(work: Work, durable: number | null) {
  const session = workSession(work, durable, {
    write: async (record, expected) => { await store.write(record, expected); thumbs.set(work.id, record.thumbnail); },
    thumbnail: snapshotThumbnail,
    changed: () => refresh()
  });
  sessions.set(work.id, session); return session;
}
function redraw() {
  painter.render(committed, current?.work.actions ?? []);
  drawing.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
  drawing.getContext("2d")!.drawImage(committed, 0, 0);
}
function select(session: Session) { current = session; alive = false; panel = undefined; redraw(); refresh(); }
function create() {
  // getRandomValues is available over local-network HTTP for device testing.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  select(attach(newWork(id), null));
}
function cancel() { contact.cancel(); activePointer = undefined; redraw(); refresh(); }
function accept(action: Action) {
  if (!current || !painter.changed(committed, current.work.actions, action)) { redraw(); return; }
  void current.save(append(current.work, action)); redraw(); refresh();
}
function refresh() {
  const t = text(); document.documentElement.lang = language;
  host.dataset.theme = dark ? "dark" : "light";
  host.querySelector("h1")!.textContent = t.title;
  get("language").textContent = `🌐 ${language === "en" ? "RU" : "EN"}`;
  get("theme").textContent = dark ? "☀" : "☾";
  const status = loading ? t.loading : readError ? t.read : current ? t[current.state] : t.empty;
  get("status").textContent = `${status}${unavailable.size ? ` · ${text().locked} ${unavailable.size}` : ""}${current ? ` · ${current.work.id.slice(0, 8)} · R${current.work.revision}` : ""}`;
  get("status").title = readError || current?.error || "";
  get("retry").hidden = !readError && !unavailable.size && current?.state !== "error";
  get("retry").textContent = t.retry;
  drawing.classList.toggle("alive", alive);
  drawing.dataset.revision = String(current?.work.revision ?? 0);
  drawing.dataset.work = current?.work.id ?? "";
  const nav = host.querySelector("nav")!; nav.replaceChildren();
  const add = (id: string, symbol: string, label: string, run: () => void, disabled = false, pressed?: boolean) => {
    const control = button("", run); control.id = id;
    const icon = document.createElement("span"); icon.className = "symbol"; icon.textContent = symbol;
    const caption = document.createElement("span"); caption.textContent = label;
    control.append(icon, caption); control.disabled = disabled || contact.busy;
    if (pressed !== undefined) control.setAttribute("aria-pressed", String(pressed)); nav.append(control);
  };
  add("colors", "✓", t.colors, () => { panel = "colors"; refresh(); }, !current || alive);
  const selectedColor = get("colors").querySelector<HTMLElement>(".symbol")!;
  selectedColor.style.background = color; selectedColor.style.color = "#3c4358"; selectedColor.classList.add("selected-color");
  add("sizes", "●", `${t.sizes} ${size}`, () => { panel = "sizes"; refresh(); }, !current || alive);
  add("tool", tool === "stroke" ? "🖌" : "▧", t[tool], () => { tool = tool === "stroke" ? "fill" : "stroke"; refresh(); }, !current || alive, tool === "fill");
  add("undo", "↶", t.undo, () => { if (current) { void current.save(undo(current.work)); redraw(); refresh(); } }, !current?.work.actions.length || alive);
  add("animate", alive ? "✎" : "♫", alive ? t.stop : t.alive, () => { alive = !alive; refresh(); }, !current, alive);
  add("works", "▦", t.works, () => { panel = "works"; refresh(); });
  get("close").textContent = t.close; get("new").textContent = t.new; get("reload").textContent = t.reload;
  get("new").hidden = panel !== "works"; get("reload").hidden = panel !== "works";
  get<HTMLButtonElement>("new").disabled = loading || !!readError;
  sheet.hidden = !panel;
  if (panel) {
    urls.splice(0).forEach(url => URL.revokeObjectURL(url)); choices.replaceChildren();
    if (panel === "colors") COLORS.forEach((value, index) => {
      const control = button(value === color ? "✓" : "", () => { color = value; panel = undefined; refresh(); });
      control.setAttribute("aria-label", `${t.colors} ${index + 1}`); control.setAttribute("aria-pressed", String(color === value));
      const swatch = document.createElement("span"); swatch.className = "swatch"; swatch.style.background = value; control.prepend(swatch); choices.append(control);
    });
    if (panel === "sizes") SIZES.forEach(value => {
      const control = button(`● ${value}${size === value ? " ✓" : ""}`, () => { size = value; panel = undefined; refresh(); });
      control.setAttribute("aria-pressed", String(size === value));
      const sample = document.createElement("span"); sample.className = "brush-sample"; sample.style.width = `${value}px`; sample.style.height = `${value}px`; control.prepend(sample); choices.append(control);
    });
    if (panel === "works") {
      sessions.forEach(session => {
        const control = button(`${session === current ? "✓ " : "✎ "}${session.work.id.slice(0, 8)} · ${t[session.state]}`, () => select(session)); control.className = "work";
        const thumbnail = thumbs.get(session.work.id);
        if (thumbnail) { const image = document.createElement("img"); const url = URL.createObjectURL(thumbnail); urls.push(url); image.src = url; image.alt = ""; control.prepend(image); }
        choices.append(control);
      });
      unavailable.forEach((_error, id) => { const control = button(`${t.locked} · ${id.slice(0, 8)}`, () => {}); control.disabled = true; choices.append(control); });
    }
  }
}
async function load() {
  loading = true; readError = ""; refresh();
  try {
    const entries = await store.list();
    unavailable.clear();
    for (const entry of entries) {
      const id = String(entry.id);
      try {
        if (typeof entry.id !== "string") throw new Error("Invalid storage key");
        const record = readRecord(entry.value, id);
        // Retry never replaces an in-memory edit with an older stored snapshot.
        if (!sessions.has(id)) attach(record.document, record.document.revision);
        thumbs.set(id, record.thumbnail);
      } catch (error) { unavailable.set(id, String(error)); }
    }
  } catch (error) { readError = String(error); }
  loading = false;
  if (!current && !readError) {
    const first = sessions.values().next().value;
    if (first) select(first);
    else if (!unavailable.size) create();
  }
  if (!current) panel = "works";
  refresh();
}
get("language").onclick = () => { if (!contact.busy) { language = language === "en" ? "ru" : "en"; refresh(); } };
get("theme").onclick = () => { if (!contact.busy) { dark = !dark; refresh(); } };
get("close").onclick = () => { panel = undefined; refresh(); };
get("new").onclick = create;
get("reload").onclick = () => { void load(); };
get("retry").onclick = () => {
  if (current?.state === "error") void current.retry();
  else if (readError || unavailable.size) void load();
};

// Gate extra fingers before they can change the shared tap filter's state.
const ignored = new Set<number>();
window.addEventListener("pointerdown", event => {
  ignored.delete(event.pointerId);
  if (activePointer !== undefined) { ignored.add(event.pointerId); event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
for (const type of ["pointermove", "pointerup", "pointercancel", "click"]) window.addEventListener(type, event => {
  const pointer = event as PointerEvent;
  if (ignored.has(pointer.pointerId) || (type === "click" && contact.busy)) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
filterDoubleTaps(window);
const point = (event: PointerEvent): Point => {
  const rect = drawing.getBoundingClientRect(); return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
};
drawing.onpointerdown = event => {
  if (!current || alive || panel || event.button !== 0) return;
  contact.start(event.pointerId, point(event), color, size); activePointer = event.pointerId; contactTool = tool;
  drawing.setPointerCapture(event.pointerId); refresh();
  if (tool === "stroke") painter.preview(drawing, committed, contact.move(event.pointerId, point(event))!);
};
drawing.onpointermove = event => {
  const stroke = contact.move(event.pointerId, point(event));
  if (stroke && contactTool === "stroke") painter.preview(drawing, committed, stroke);
};
drawing.onpointerup = event => {
  const stroke = contact.end(event.pointerId, point(event));
  if (!stroke) return;
  activePointer = undefined;
  if (contactTool === "stroke") accept(stroke);
  else {
    const region = painter.regionAt(stroke.points[0]!);
    if (region) accept({ kind: "fill", color: stroke.color, region });
  }
  refresh();
};
drawing.onpointercancel = cancel;
drawing.onlostpointercapture = () => { if (contact.busy) cancel(); };
drawing.oncontextmenu = event => event.preventDefault();
window.addEventListener("resize", cancel);
window.addEventListener("blur", cancel);
document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
window.addEventListener("pagehide", () => { cancel(); void store.close(); });
redraw(); void load();
