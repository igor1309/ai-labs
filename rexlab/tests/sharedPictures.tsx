import { useLayoutEffect, useRef, type ViewTransitionProps } from "react";
import type { PictureTransition } from "../src/SharedPicture.tsx";
import type { Box } from "../src/turnMotion.ts";

type Capture = { props: ViewTransitionProps; box: Box };

// A view-transition pair with an old capture and a live destination.
// Progress is the eased fraction, advanced only by the test.
export function manualSharedPictures(measure: (element: HTMLElement) => Box) {
  const mounted = new Map<string, { props: ViewTransitionProps; element: HTMLElement }>();
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
  const capture = (name: string): Capture => {
    const { props, element } = picture(name);
    return { props, box: measure(element) };
  };
  const begin = (from: Capture, type: string) => {
    const name = from.props.name!;
    const to = picture(name);
    const sharing = ({ share, default: fallback }: ViewTransitionProps) => typeof share === "object" ? share[type] ?? share.default : share ?? fallback;
    if (sharing(from.props) !== "dinosaur-share" || sharing(to.props) !== "dinosaur-share") throw new Error(`No shared transition for ${type}`);
    return {
      from: from.box,
      at: (progress: number): Box => {
        const target = measure(picture(name).element);
        const mix = (key: keyof Box) => from.box[key] + (target[key] - from.box[key]) * progress;
        return { left: mix("left"), top: mix("top"), width: mix("width"), height: mix("height") };
      }
    };
  };
  return { Transition, capture, begin };
}
