import { ACESFilmicToneMapping, Box3, DirectionalLight, Group, HemisphereLight, MathUtils, Mesh, OrthographicCamera, PointLight, Quaternion, Scene, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "./assets/home/skeleton-hero/assembly.glb?url&no-inline";
import { skeletonDuration } from "./homeSkeletonHero.ts";

type Assembly = { end: number[]; start: number[]; spin: number[]; at: number; duration: number };

function disposeModel(model: Group): void {
  const geometries = new Set<import("three").BufferGeometry>();
  const materials = new Set<import("three").Material>();
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export async function skeletonHeroScene(canvas: HTMLCanvasElement, signal: AbortSignal, pixelRatio: number) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(pixelRatio, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const releaseRenderer = () => { renderer.dispose(); renderer.forceContextLoss(); };
  let model: Group | undefined;
  try {
    const response = await fetch(modelUrl, { signal });
    if (!response.ok) throw new Error("Skeleton asset unavailable");
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
    model = gltf.scene;
    if (signal.aborted) throw new Error("Skeleton visit ended");
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 100);
    camera.position.set(0, 4.8, 20);
    camera.lookAt(0, 2.35, 0);
    scene.add(new HemisphereLight(0xffffff, 0xbcb7ad, 1.7));
    const key = new DirectionalLight(0xfff9ee, 2);
    key.position.set(-4, 10, 7); scene.add(key);
    const rim = new DirectionalLight(0xeef2ff, 1.4);
    rim.position.set(4, 6, -6); scene.add(rim);
    const fill = new PointLight(0xffc486, 18, 18);
    fill.position.set(-7, 3, 4); scene.add(fill);
    const pivot = model.children[0]!;
    const parts = pivot.children.filter(object => object.userData.assembly).map(object => {
      const data = object.userData.assembly as Assembly;
      return { object, end: new Vector3().fromArray(data.end), start: new Vector3().fromArray(data.start), spin: new Quaternion().fromArray(data.spin), at: data.at, duration: data.duration };
    });
    if (parts.length === 0) throw new Error("Skeleton assembly data missing");
    scene.add(model);
    // Include the complete turn and the assembly arcs in one fixed frame.
    const bounds = new Box3().setFromObject(model);
    const radius = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + 1;
    const halfHeight = Math.max(2.35 - bounds.min.y, bounds.max.y - 2.35) + radius * .13 + .5;
    const identity = new Quaternion();
    let oldWidth = 0, oldHeight = 0, disposed = false;
    return {
      draw(width: number, height: number, milliseconds: number) {
        if (disposed) return;
        if (width !== oldWidth || height !== oldHeight) {
          const aspect = width / height;
          const top = Math.max(halfHeight, radius / aspect);
          camera.left = -top * aspect; camera.right = top * aspect;
          camera.top = top; camera.bottom = -top;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          oldWidth = width; oldHeight = height;
        }
        const seconds = Math.min(milliseconds, skeletonDuration) / 1000;
        for (const part of parts) {
          const u = MathUtils.clamp((seconds * 1.2 - part.at) / part.duration, 0, 1);
          const e = u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
          part.object.position.lerpVectors(part.start, part.end, e);
          part.object.position.y += Math.sin(Math.PI * u) * (.8 + Math.max(0, part.end.y) * .20);
          part.object.quaternion.slerpQuaternions(part.spin, identity, e);
        }
        pivot.rotation.y = .36 + MathUtils.smootherstep(seconds, 6, 14) * Math.PI * 2;
        renderer.render(scene, camera);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeModel(gltf.scene); scene.clear(); releaseRenderer();
      }
    };
  } catch (error) {
    if (model) disposeModel(model);
    releaseRenderer(); throw error;
  }
}
