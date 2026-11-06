import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { MeshoptSimplifier } from "meshoptimizer";

// Run with tsx scripts/skeleton-hero.ts source.stl output.glb.
// The scan is Z-up and diagonal; its principal ground-plane axis becomes X.
export async function convertSkeleton(data: ArrayBuffer, targetTriangles: number) {
  const source = new STLLoader().parse(data);
  source.deleteAttribute("normal");
  const geometry = mergeVertices(source, 1e-5);
  const attribute = geometry.getAttribute("position");
  let mx = 0, my = 0, xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < attribute.count; i++) { mx += attribute.getX(i); my += attribute.getY(i); }
  mx /= attribute.count; my /= attribute.count;
  for (let i = 0; i < attribute.count; i++) {
    const x = attribute.getX(i) - mx, y = attribute.getY(i) - my;
    xx += x * x; yy += y * y; xy += x * y;
  }
  geometry.rotateZ(-.5 * Math.atan2(2 * xy, xx - yy));
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new Vector3());
  geometry.scale(10 / size.x, 10 / size.x, 10 / size.x);
  const originalPositions = new Float32Array(attribute.array);
  await MeshoptSimplifier.ready;
  const [indices, error] = MeshoptSimplifier.simplify(
    new Uint32Array(geometry.index!.array), originalPositions, 3,
    Math.min(geometry.index!.count, targetTriangles * 3), .001
  );
  // compactMesh rewrites indices in place; only the vertex stream needs remapping.
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < remap.length; i++) {
    if (remap[i] !== 0xffffffff) positions.set(originalPositions.subarray(i * 3, i * 3 + 3), remap[i]! * 3);
  }
  if (indices.some(index => index >= count)) throw new Error("Skeleton index exceeds vertex count");
  const simplified = new BufferGeometry()
    .setAttribute("position", new BufferAttribute(positions, 3))
    .setIndex(new BufferAttribute(indices, 1));
  simplified.computeVertexNormals();
  const normals = new Float32Array(simplified.getAttribute("normal").array);
  if (!normals.every(Number.isFinite)) throw new Error("Skeleton has non-finite normals");
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer);
  const normal = doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer);
  const index = doc.createAccessor().setType("SCALAR")
    .setArray(count < 65536 ? new Uint16Array(indices) : indices).setBuffer(buffer);
  const material = doc.createMaterial("Warm ivory").setBaseColorFactor([.73, .64, .49, 1])
    .setRoughnessFactor(.85).setMetallicFactor(0).setDoubleSided(true);
  const primitive = doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal)
    .setIndices(index).setMaterial(material);
  const mesh = doc.createMesh("Tyrannosaurus rex skeleton — Rigsters").addPrimitive(primitive);
  doc.createScene("Home skeleton").addChild(doc.createNode("T. rex").setMesh(mesh));
  doc.getRoot().getAsset().copyright = "Rigsters, CC BY 4.0 https://creativecommons.org/licenses/by/4.0/; Wikimedia Commons Tyrannosaurus rex skeleton.stl; simplified, reoriented and ivory material by RexLab";
  const glb = await new NodeIO().writeBinary(doc);
  return { glb, triangles: indices.length / 3, vertices: count, relativeError: error };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error("Usage: tsx scripts/skeleton-hero.ts source.stl output.glb");
  const bytes = await readFile(input);
  const { glb, ...stats } = await convertSkeleton(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 40_000);
  if (glb.length >= 2_000_000) throw new Error("Skeleton exceeds the two-megabyte budget");
  await writeFile(output, glb);
  console.log(JSON.stringify({ ...stats, bytes: glb.length }));
}
