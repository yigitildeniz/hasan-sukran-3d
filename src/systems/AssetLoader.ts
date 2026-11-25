import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ManifestEntry {
  file: string;
  scale?: number;
  rotationY?: number;
  offsetY?: number;
}

/**
 * Optional .glb pipeline. Entities always build procedural fallback geometry first so the
 * game starts instantly; if `public/models/manifest.json` lists a model for the same key,
 * it is loaded in the background and swapped in.
 */
export class AssetLoader {
  private loader = new GLTFLoader();
  private manifest: Record<string, ManifestEntry> = {};
  private ready: Promise<void>;
  private cache = new Map<string, Promise<THREE.Object3D | null>>();

  constructor(private basePath = `${import.meta.env.BASE_URL}models/`) {
    this.ready = fetch(`${this.basePath}manifest.json`)
      .then((r) => (r.ok ? r.json() : { models: {} }))
      .then((j: { models?: Record<string, ManifestEntry> }) => {
        this.manifest = j.models ?? {};
        const n = Object.keys(this.manifest).length;
        if (n) console.info(`[assets] manifest lists ${n} model(s):`, Object.keys(this.manifest));
      })
      .catch(() => {
        this.manifest = {};
      });
  }

  /** Returns the loaded model (cloned) or null if not configured / failed. */
  async load(key: string): Promise<THREE.Object3D | null> {
    await this.ready;
    const entry = this.manifest[key];
    if (!entry) return null;
    let p = this.cache.get(key);
    if (!p) {
      p = this.loader
        .loadAsync(this.basePath + entry.file)
        .then((gltf) => {
          const root = gltf.scene;
          root.scale.setScalar(entry.scale ?? 1);
          root.rotation.y = entry.rotationY ?? 0;
          root.position.y = entry.offsetY ?? 0;
          root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          return root as THREE.Object3D;
        })
        .catch((err) => {
          console.warn(`[assets] failed to load ${entry.file}, keeping procedural fallback`, err);
          return null;
        });
      this.cache.set(key, p);
    }
    const src = await p;
    return src ? src.clone(true) : null;
  }

  /**
   * Replace the children of `holder` with the glb for `key` when available.
   * The holder keeps its transform, so gameplay code is unaffected.
   */
  swapIn(key: string, holder: THREE.Object3D, onSwap?: (model: THREE.Object3D) => void): void {
    this.load(key).then((model) => {
      if (!model) return;
      for (const c of [...holder.children]) if (!c.userData.keepOnSwap) holder.remove(c);
      holder.add(model);
      onSwap?.(model);
    });
  }
}

export const assets = new AssetLoader();
