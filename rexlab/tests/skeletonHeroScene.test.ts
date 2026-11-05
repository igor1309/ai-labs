import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { BufferGeometry, Group, Material, Mesh, Vector3 } from "three";
import { skeletonHeroScene } from "../src/skeletonHeroScene.ts";

const gpu = vi.hoisted(() => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn()
}));
vi.mock("three", async importOriginal => ({
  ...await importOriginal<typeof import("three")>(),
  WebGLRenderer: class { constructor() { return gpu; } }
}));
const bytes = readFileSync(join(import.meta.dirname, "../src/assets/home/skeleton-hero/tyrannosaurus.glb"));
function asset() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })));
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

test("the real optimized GLB fits every yaw and layout without stretching, with warm ivory material", async () => {
  asset();
  const controller = new AbortController();
  const scene = await skeletonHeroScene({} as HTMLCanvasElement, controller.signal, 3);
  try {
    expect(bytes.length).toBeLessThan(2_000_000);
    const manifest = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(manifest.buffers.every((buffer: { uri?: string }) => buffer.uri === undefined)).toBe(true);
    expect(manifest.images ?? []).toEqual([]);
    expect(manifest.textures ?? []).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("tyrannosaurus.glb"), { signal: controller.signal });
    expect(gpu.setPixelRatio).toHaveBeenCalledWith(1.5);
    for (const [width, height] of [[590, 300], [744, 160], [375, 160], [144, 276]]) for (const yaw of [-.1, 0, .1]) {
      scene.draw(width!, height!, yaw);
      const [world, camera] = gpu.render.mock.lastCall!;
      world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const pivot = world.children.find((child: unknown) => child instanceof Group)!;
      expect(pivot.rotation.y).toBe(yaw);
      let largest = 0;
      let vertices = 0;
      world.traverse((object: Mesh) => {
        if (!(object instanceof Mesh)) return;
        expect(object.scale.toArray()).toEqual([1, 1, 1]);
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
  scene.dispose(); scene.dispose();
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(materials).toHaveBeenCalledTimes(1);
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
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(materials).toHaveBeenCalledTimes(1);
  }
});
