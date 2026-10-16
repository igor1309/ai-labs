import { useState, type PointerEvent } from "react";

// A card brightens only under a hovering pointer: a finger has no hover,
// and a touch would otherwise leave the card bright after it lifts. The
// pressed state shows from the moment of contact, before the tap acts.
export function usePointerState() {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return {
    "data-hovered": hovered || undefined,
    "data-pressed": pressed || undefined,
    onPointerEnter: (event: PointerEvent) => setHovered(event.pointerType !== "touch"),
    onPointerLeave: () => {
      setHovered(false);
      setPressed(false);
    },
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false)
  };
}
