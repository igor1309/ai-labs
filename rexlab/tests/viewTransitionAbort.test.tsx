import { act, startTransition, ViewTransition } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Chromium skips a view transition when the viewport changes size during it
// and rejects `ready` with React's known abort message plus a reason. React
// must treat that as the skip it is, not as an error on the page.
describe("a view transition the browser aborts", () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it.each([
    "Transition was aborted because of invalid state",
    "Transition was aborted because of invalid state. Viewport size changed"
  ])("is not reported when the browser says %j", async message => {
    Object.defineProperty(document, "fonts", { value: { status: "loaded", ready: Promise.resolve() }, configurable: true });
    (document as { startViewTransition?: unknown }).startViewTransition = ({ update }: { update: () => void }) => {
      update();
      const aborted = new DOMException(message, "InvalidStateError");
      const ready = Promise.reject(aborted);
      return { ready, finished: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
    };
    const reported = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, { onRecoverableError: reported, onUncaughtError: reported, onCaughtError: reported });
    await act(async () => root.render(<ViewTransition><p>first</p></ViewTransition>));
    await act(async () => startTransition(() => root.render(<ViewTransition><p>second</p></ViewTransition>)));
    expect(container.textContent).toBe("second");
    expect(reported).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});
