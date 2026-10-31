import { useEffect, useRef } from "react";

export type ArtworkPreview = {
  width: number;
  height: number;
  render(target: HTMLCanvasElement): void;
};

export function ColoringArtworkPreview({ preview }: { preview: ArtworkPreview }) {
  const surface = useRef<HTMLCanvasElement>(null);
  useEffect(() => { preview.render(surface.current!); }, [preview]);
  return <canvas ref={surface} className="gallery-artwork-preview" aria-hidden="true" width={preview.width} height={preview.height} />;
}
