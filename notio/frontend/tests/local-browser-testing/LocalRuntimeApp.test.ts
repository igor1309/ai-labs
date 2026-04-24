import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import App from "../../src/app.svelte";
import { createLocalRuntime } from "../../src/local-browser-testing/createLocalRuntime";

describe("local browser testing app runtime", () => {
  it("signIn shouldShowAuthenticatedShell_onLocalRuntime", async () => {
    const runtime = createLocalRuntime();

    render(App, {
      props: {
        authSession: runtime.authSession,
        reader: runtime.reader
      }
    });

    await fireEvent.input(screen.getByLabelText("Email"), { target: { value: "local@example.com" } });
    await fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    await waitFor(() => expect(screen.getByText("local@example.com")).toBeDefined());
  });
});
