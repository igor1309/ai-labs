import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { words } from "./support.ts";

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

// Each choice in `menu`, as its name in words and whether it is checked
// and shows a ✓.
export function choicesIn(menu: HTMLElement) {
  return within(menu)
    .getAllByRole("menuitemradio")
    .map((choice) => ({
      name: words(choice),
      checked: choice.getAttribute("aria-checked") === "true",
      tick: choice.querySelector("svg.lucide-check") !== null
    }));
}
