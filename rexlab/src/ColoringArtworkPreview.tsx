import { useId } from "react";
import { BASE_COLOR, HEIGHT, VECTOR_SCALE, WIDTH, type Geometry, type VectorShape } from "./coloring/index.ts";

function Shape({ shape }: { shape: VectorShape }) {
  const translate = `translate(${shape.x} ${shape.y})`;
  return "path" in shape ? <path d={shape.path} transform={translate} /> :
    <ellipse cx={shape.width / 2} cy={shape.height / 2} rx={shape.width / 2} ry={shape.height / 2}
      transform={`${translate} rotate(${-shape.rotation} ${shape.width / 2} ${shape.height / 2})`} />;
}

export function ColoringArtworkPreview({ geometry }: { geometry: Geometry }) {
  const id = useId();
  return <svg className="gallery-artwork-preview" aria-hidden="true" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
    <g transform={`scale(${VECTOR_SCALE})`} strokeLinecap="round" strokeLinejoin="round">
      <defs>{geometry.regions.map(region => <clipPath id={`${id}-${region.id}`} key={region.id}><Shape shape={region} /></clipPath>)}</defs>
      {geometry.regions.map(region => {
        let content = <g fill={BASE_COLOR} stroke="#091e40" strokeWidth={region.outline}><Shape shape={region} /></g>;
        let parent = region.parent;
        while (parent) {
          content = <g clipPath={`url(#${id}-${parent})`}>{content}</g>;
          parent = geometry.regions.find(candidate => candidate.id === parent)?.parent;
        }
        return <g key={region.id}>{content}</g>;
      })}
      {geometry.details.map((detail, index) => <g key={index} fill={detail.fill ?? "none"} stroke={detail.stroke ?? "none"} strokeWidth={detail.strokeWidth ?? 0}><Shape shape={detail} /></g>)}
    </g>
  </svg>;
}
