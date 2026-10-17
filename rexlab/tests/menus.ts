import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

// Opens the home page's menu for parents labelled `label`.
export async function openMenu(user: UserEvent, label: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: label }));
  return screen.getByRole("menu", { name: label });
}

// Chooses `choice` from the menu labelled `label`.
export async function chooseFrom(user: UserEvent, label: string, choice: string) {
  await user.click(within(await openMenu(user, label)).getByRole("menuitemradio", { name: choice }));
}

// What covers the page under an open menu, where a tap outside the menu
// lands.
export function outsideMenu(): HTMLElement {
  const backdrop = document.querySelector<HTMLElement>(".menu-backdrop");
  if (!backdrop) throw new Error("No menu is open");
  return backdrop;
}

// The name of the first symbol an element shows, such as "sun" or "globe".
export function symbolOf(element: Element): string | undefined {
  const classes = element.querySelector("svg.lucide")?.classList ?? [];
  return [...classes].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length);
}

// Each choice in `menu`, as its name and whether it is checked and shows a ✓.
export function choicesIn(menu: HTMLElement) {
  return within(menu)
    .getAllByRole("menuitemradio")
    .map((choice) => ({
      name: choice.textContent,
      checked: choice.getAttribute("aria-checked") === "true",
      tick: choice.querySelector("svg.lucide-check") !== null
    }));
}
