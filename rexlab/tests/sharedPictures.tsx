import { useLayoutEffect, useRef, type ViewTransitionProps } from "react";
import type { PictureTransition } from "../src/SharedPicture.tsx";

type Picture = { props: ViewTransitionProps; element: HTMLElement };

// The props and mounted pictures handed to React's ViewTransition.
// The browser owns shared-picture geometry and interpolation.
export function recordedSharedPictures() {
  const mounted = new Map<string, Picture>();
  const Transition: PictureTransition = (props) => {
    const host = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
      if (!props.name || !host.current?.firstElementChild) throw new Error("A shared picture needs a name and an element");
      mounted.set(props.name, { props, element: host.current.firstElementChild as HTMLElement });
      return () => { mounted.delete(props.name!); };
    }, [props]);
    return <span ref={host} style={{ display: "contents" }}>{props.children}</span>;
  };
  const picture = (name: string) => {
    const found = mounted.get(name);
    if (!found) throw new Error(`No shared picture ${name}`);
    return found;
  };
  return { Transition, picture, pictures: () => [...mounted.values()] };
}
