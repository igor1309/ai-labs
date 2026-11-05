import { Box3, DirectionalLight, Group, HemisphereLight, Mesh, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "./assets/home/skeleton-hero/tyrannosaurus.glb?url&no-inline";
type RenderedSkeleton = {
  draw(width: number, height: number, yaw: number): void;
  dispose(): void;
};

function disposeModel(model: Group): void {
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}

export async function skeletonHeroScene(canvas: HTMLCanvasElement, signal: AbortSignal, pixelRatio: number): Promise<RenderedSkeleton> {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(pixelRatio, 1.5));
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
    camera.position.set(0, 0, 20);
    scene.add(new HemisphereLight(0xfff5df, 0x37465d, 2));
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(-3, 6, 8);
    scene.add(key);
    const bounds = new Box3().setFromObject(model);
    model.position.sub(bounds.getCenter(new Vector3()));
    const size = bounds.getSize(new Vector3());
    const pivot = new Group();
    pivot.add(model);
    scene.add(pivot);
    // The full horizontal bounding circle fits at every yaw; vertical bounds
    // stay fixed because the model only turns around its upright axis.
    const halfWidth = Math.hypot(size.x, size.z) / 2 * 1.06;
    const halfHeight = size.y / 2 * 1.06;
    let oldWidth = 0;
    let oldHeight = 0;
    let disposed = false;
    return {
      draw(width, height, yaw) {
        if (disposed) return;
        if (width !== oldWidth || height !== oldHeight) {
          const aspect = width / height;
          const top = Math.max(halfHeight, halfWidth / aspect);
          camera.left = -top * aspect;
          camera.right = top * aspect;
          camera.top = top;
          camera.bottom = -top;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          oldWidth = width;
          oldHeight = height;
        }
        pivot.rotation.y = yaw;
        renderer.render(scene, camera);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeModel(gltf.scene);
        scene.clear();
        releaseRenderer();
      }
    };
  } catch (error) {
    if (model) disposeModel(model);
    releaseRenderer();
    throw error;
  }
}
