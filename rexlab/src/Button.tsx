import type { ComponentProps } from "react";
import { usePointerState } from "./usePointerState.ts";

// Every button of the app: it brightens under a hovering pointer and shows
// pressed from the moment of contact, through its own pointer state, never
// through CSS :hover, which a finger leaves behind after it lifts. A button that does
// not respond, disabled or marked so, shows neither. A pointer handler the
// caller gives runs as well as the button's own.
export function Button({ type = "button", onPointerEnter, onPointerLeave, onPointerDown, onPointerUp, onPointerCancel, ...props }: ComponentProps<"button">) {
  const { "data-hovered": hovered, "data-pressed": pressed, ...pointer } = usePointerState();
  const responds = !props.disabled && !props["aria-disabled"];
  return (
    <button
      type={type}
      data-hovered={responds ? hovered : undefined}
      data-pressed={responds ? pressed : undefined}
      {...props}
      onPointerEnter={(event) => {
        pointer.onPointerEnter(event);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        pointer.onPointerLeave();
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        pointer.onPointerDown();
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        pointer.onPointerUp();
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        pointer.onPointerCancel();
        onPointerCancel?.(event);
      }}
    />
  );
}
