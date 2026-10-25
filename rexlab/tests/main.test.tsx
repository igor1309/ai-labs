import { afterEach, expect, it, vi } from "vitest";

// main.tsx, the app's entry, with the app itself left out: only what it
// puts before the app is under test.
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: () => {} }) }));
vi.mock("../src/root.ts", async (actual) => ({ ...(await actual<typeof import("../src/root.ts")>()), appProps: () => ({}) }));

// A step of a touch on the page, at `time` ms, and whether the page let
// it reach the app.
function touch(type: string, time: number) {
  const event = new PointerEvent(type, { pointerId: 1, button: 0, pointerType: "touch", bubbles: true, cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: time });
  document.body.dispatchEvent(event);
  return !event.defaultPrevented;
}

it("puts the double-tap filter before the app", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import("../src/main.tsx");

  expect([touch("pointerdown", 0), touch("pointerup", 50), touch("pointerdown", 250)]).toEqual([true, true, false]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The app's entry run afresh in a build, with a browser that keeps what
// it is asked to register.
async function launch(released: boolean) {
  vi.resetModules();
  vi.stubEnv("PROD", released);
  const registered: string[] = [];
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register: async (url: string) => { registered.push(url); } } });
  document.body.innerHTML = '<div id="root"></div>';
  await import("../src/main.tsx");
  return registered;
}

it("registers the offline worker in a release", async () => {
  expect(await launch(true)).toEqual(["/sw.js"]);
});

it("registers no worker in development", async () => {
  expect(await launch(false)).toEqual([]);
});
