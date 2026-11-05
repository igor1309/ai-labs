import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { BufferGeometry, Group, Material, MathUtils, Mesh, Quaternion, Vector3 } from "three";
import { skeletonHeroScene } from "../src/skeletonHeroScene.ts";

const gpu = vi.hoisted(() => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn()
}));
vi.mock("three", async importOriginal => ({
  ...await importOriginal<typeof import("three")>(),
  WebGLRenderer: class { constructor() { return gpu; } }
}));
const bytes = readFileSync(join(import.meta.dirname, "../src/assets/home/skeleton-hero/assembly.glb"));
function asset() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })));
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

test("every bone moves from its pile transform through assembly into the completed hold", async () => {
  asset();
  const scene = await skeletonHeroScene({} as HTMLCanvasElement, new AbortController().signal, 1);
  try {
    scene.draw(590, 300, 0);
    const [world] = gpu.render.mock.lastCall!;
    const bones: Group[] = [];
    world.traverse((object: Group) => { if (object.userData.assembly) bones.push(object); });
    expect(bones.length).toBe(104);
    const identity = new Quaternion();
    const lead = Math.min(...bones.map(bone => bone.userData.assembly.at)) - .1;
    for (const bone of bones) {
      const { start, end, spin, at, duration } = bone.userData.assembly;
      const from = new Vector3().fromArray(start), to = new Vector3().fromArray(end);
      const rotation = new Quaternion().fromArray(spin);
      scene.draw(590, 300, 0);
      expect(bone.position.distanceTo(from)).toBeLessThan(1e-6);
      expect(bone.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
      expect(from.distanceTo(to)).toBeGreaterThan(.01);

      scene.draw(590, 300, (at - lead + duration / 2) / 1.2 * 1000);
      const flat = (v: Vector3) => new Vector3(v.x, 0, v.z);
      const travelled = flat(bone.position).sub(flat(from)).dot(flat(to).sub(flat(from))) / flat(to).sub(flat(from)).lengthSq();
      if (flat(to).distanceTo(flat(from)) > .01) expect(travelled).toBeGreaterThan(.5);
      expect(bone.position.y).toBeGreaterThan(Math.min(from.y, to.y));
      expect(bone.quaternion.angleTo(rotation)).toBeGreaterThan(.001);
      expect(bone.quaternion.angleTo(identity)).toBeGreaterThan(.001);
    }
    for (const milliseconds of [5000, 5500, 6000, 14000]) {
      scene.draw(590, 300, milliseconds);
      for (const bone of bones) {
        expect(bone.position.distanceTo(new Vector3().fromArray(bone.userData.assembly.end))).toBeLessThan(1e-6);
        expect(bone.quaternion.angleTo(identity)).toBeLessThan(1e-6);
      }
    }
  } finally { scene.dispose(); }
});

test("the assembled asset fits the pile, assembly and full turn without stretching", async () => {
  asset();
  const controller = new AbortController();
  const scene = await skeletonHeroScene({} as HTMLCanvasElement, controller.signal, 3);
  try {
    expect(bytes.length).toBeLessThan(2_000_000);
    const manifest = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(manifest.buffers.every((buffer: { uri?: string }) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toEqual([]);
    expect(manifest.textures ?? []).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("assembly.glb"), { signal: controller.signal });
    expect(gpu.setPixelRatio).toHaveBeenCalledWith(1.5);
    const scales = new Map<Mesh, number[]>();
    for (const [width, height] of [[590, 300], [744, 160], [375, 160], [144, 276]]) for (const ms of [0, 2500, 6000, 8000, 10000, 14000]) {
      scene.draw(width!, height!, ms);
      const [world, camera] = gpu.render.mock.lastCall!;
      world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const pivot = world.children.find((child: unknown) => child instanceof Group)!;
      expect(pivot.children[0].rotation.y).toBe(.36 + MathUtils.smootherstep(ms / 1000, 6, 14) * Math.PI * 2);
      let largest = 0;
      let vertices = 0;
      world.traverse((object: Mesh) => {
        if (!(object instanceof Mesh)) return;
        if (!scales.has(object)) scales.set(object, object.scale.toArray());
        expect(object.scale.toArray()).toEqual(scales.get(object));
        const material = object.material as Material & { color: { r: number; g: number; b: number } };
        expect(material.color.r).toBeGreaterThan(material.color.g);
        expect(material.color.g).toBeGreaterThan(material.color.b);
        const positions = object.geometry.attributes.position!;
        const indices = object.geometry.index!.array;
        expect(Array.from(indices).reduce((largest, index) => Math.max(largest, index), 0)).toBeLessThan(positions.count);
        expect([...object.geometry.attributes.normal!.array].every(Number.isFinite)).toBe(true);
        const point = new Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
          largest = Math.max(largest, Math.abs(point.x), Math.abs(point.y));
        }
        vertices += positions.count;
      });
      expect(vertices).toBeGreaterThan(10_000);
      expect(largest).toBeLessThan(.95);
    }
    expect(gpu.setSize.mock.calls).toEqual([[590, 300, false], [744, 160, false], [375, 160, false], [144, 276, false]]);
    const before = gpu.setSize.mock.calls.length;
    scene.draw(144, 276, .05);
    expect(gpu.setSize).toHaveBeenCalledTimes(before);
  } finally { scene.dispose(); }
});

test("leaving releases geometry, materials, GPU renderer and context exactly once", async () => {
  asset();
  const geometry = vi.spyOn(BufferGeometry.prototype, "dispose");
  const materials = vi.spyOn(Material.prototype, "dispose");
  const scene = await skeletonHeroScene({} as HTMLCanvasElement, new AbortController().signal, 1);
  scene.draw(500, 200, 0);
  scene.dispose();
  const released = [geometry.mock.calls.length, materials.mock.calls.length];
  scene.dispose();
  expect([geometry.mock.calls.length, materials.mock.calls.length]).toEqual(released);
  expect(geometry.mock.calls.length).toBeGreaterThan(0);
  expect(materials.mock.calls.length).toBeGreaterThan(0);
  expect(gpu.dispose).toHaveBeenCalledTimes(1);
  expect(gpu.forceContextLoss).toHaveBeenCalledTimes(1);
  const drawn = gpu.render.mock.calls.length;
  scene.draw(500, 200, 0);
  expect(gpu.render).toHaveBeenCalledTimes(drawn);
});

test.each(["http", "parse", "aborted"])("releases GPU resources if loading ends with %s", async reason => {
  asset();
  const geometry = vi.spyOn(BufferGeometry.prototype, "dispose");
  const materials = vi.spyOn(Material.prototype, "dispose");
  const controller = new AbortController();
  if (reason === "http") vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  if (reason === "parse") vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  const loading = skeletonHeroScene({} as HTMLCanvasElement, controller.signal, 1);
  if (reason === "aborted") controller.abort();
  await expect(loading).rejects.toThrow();
  expect(gpu.dispose).toHaveBeenCalledTimes(1);
  expect(gpu.forceContextLoss).toHaveBeenCalledTimes(1);
  if (reason === "aborted") {
    expect(geometry.mock.calls.length).toBeGreaterThan(0);
    expect(materials.mock.calls.length).toBeGreaterThan(0);
  }
});
