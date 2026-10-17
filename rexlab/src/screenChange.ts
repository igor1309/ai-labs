import { addTransitionType, startTransition } from "react";

// The view transition type of one screen giving way to another.
export const SCREEN_CHANGE = "screen-change";

// Makes `update` a view transition of `type`, where the browser has view
// transitions; elsewhere the screen changes at once.
export function changeScreen(type: string, update: () => void) {
  startTransition(() => {
    addTransitionType(type);
    update();
  });
}
