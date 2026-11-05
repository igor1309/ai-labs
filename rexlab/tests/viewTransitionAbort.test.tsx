import { startTransition, ViewTransition } from "react";
import { act } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Chromium skips a view transition when the viewport changes size during it
// and rejects `ready` with React's known abort message plus a reason. React
// must treat that as the skip it is, not as an error on the page.
describe("a view transition the browser aborts", () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    vi.unstubAllGlobals();
  });

  it.each([
    { message: "Transition was aborted because of invalid state", name: "InvalidStateError", reports: false },
    { message: "Transition was aborted because of invalid state. Viewport size changed", name: "InvalidStateError", reports: false },
    { message: "Transition was aborted because of timeout in DOM update. DOM update timed out", name: "TimeoutError", reports: true },
    { message: "Unexpected view transition failure", name: "Error", reports: true }
  ])("reports=$reports when the browser says $message", async ({ message, name, reports }) => {
    Object.defineProperty(document, "fonts", { value: { status: "loaded", ready: Promise.resolve() }, configurable: true });
    // A real DOM-update timeout occurs while the callback is still pending.
    // React waits for a pending Navigation API transition without a deadline.
    vi.stubGlobal("navigation", { transition: { finished: new Promise(() => {}) } });
    const start = vi.fn(({ update }: { update: () => void }) => {
      const aborted = new DOMException(message, name);
      const ready = Promise.resolve().then(() => { update(); throw aborted; });
      return { ready, finished: ready.catch(() => {}), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
    });
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    const reported = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, { onRecoverableError: reported, onUncaughtError: reported, onCaughtError: reported });
    await act(async () => root.render(<ViewTransition><p>first</p></ViewTransition>));
    await act(async () => startTransition(() => root.render(<ViewTransition><p>second</p></ViewTransition>)));
    expect(container.textContent).toBe("second");
    expect(start).toHaveBeenCalledTimes(1);
    if (reports) {
      expect(reported).toHaveBeenCalledTimes(1);
      const error = reported.mock.calls[0]![0];
      expect(error.cause ?? error).toMatchObject({ name, message });
    } else expect(reported).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});
