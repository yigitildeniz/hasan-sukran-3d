import * as THREE from 'three';
import type { CollisionWorld } from '../systems/Collision';
import { rand } from './textures';

interface P { x: number; z: number; s: number; r: number }

/** Batches repeated props (trees, bushes, lamps, benches) into InstancedMeshes. */
export class PropField {
  private trees: P[] = [];
  private bushes: P[] = [];
  private lamps: P[] = [];
  private benches: P[] = [];

  constructor(private root: THREE.Object3D, private collision: CollisionWorld) {}

  addTree(x: number, z: number, s = 1): void {
    this.trees.push({ x, z, s, r: rand() * Math.PI * 2 });
    const t = 0.22 * s;
    this.collision.addBox(x - t, x + t, 0, 3 * s, z - t, z + t);
  }

  addBush(x: number, z: number, s = 1): void {
    this.bushes.push({ x, z, s, r: rand() * Math.PI * 2 });
  }

  addLamp(x: number, z: number, rotY: number): void {
    this.lamps.push({ x, z, s: 1, r: rotY });
    this.collision.addBox(x - 0.15, x + 0.15, 0, 6, z - 0.15, z + 0.15);
  }

  addBench(x: number, z: number, rotY: number): void {
    this.benches.push({ x, z, s: 1, r: rotY });
    const along = Math.abs(Math.sin(rotY)) > 0.5;
    const hw = along ? 0.35 : 0.95, hd = along ? 0.95 : 0.35;
    this.collision.addBox(x - hw, x + hw, 0, 0.85, z - hd, z + hd);
  }

  private static jitter(g: THREE.BufferGeometry, amt: number): THREE.BufferGeometry {
    const p = g.attributes.position as THREE.BufferAttribute;
    const seen = new Map<string, [number, number, number]>();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let o = seen.get(k);
      if (!o) seen.set(k, (o = [(rand() - 0.5) * amt, (rand() - 0.5) * amt, (rand() - 0.5) * amt]));
      p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
    }
    g.computeVertexNormals();
    return g;
  }

  build(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);

    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: P[], place: (p: P, i: number) => void, colorFn?: (p: P) => THREE.Color) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = true;
      im.receiveShadow = true;
      list.forEach((p, i) => {
        place(p, i);
        im.setMatrixAt(i, m);
        if (colorFn) im.setColorAt(i, colorFn(p));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.root.add(im);
      return im;
    };

    // --- trees
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 3, 7).translate(0, 1.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b4331', roughness: 0.95 });
    inst(trunkGeo, trunkMat, this.trees, (p) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 0, p.z), q, sc.setScalar(p.s));
    });
    const leafGeo = PropField.jitter(new THREE.IcosahedronGeometry(1.5, 1), 0.45);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const leafColor = () => col.setHSL(0.24 + rand() * 0.06, 0.42 + rand() * 0.15, 0.27 + rand() * 0.08);
    inst(leafGeo, leafMat, this.trees, (p) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 3.4 * p.s, p.z), q, sc.set(p.s * 1.15, p.s * 1.0, p.s * 1.15));
    }, leafColor);
    inst(leafGeo, leafMat, this.trees, (p) => {
      q.setFromAxisAngle(up, p.r + 1);
      m.compose(v.set(p.x + Math.cos(p.r) * 0.6 * p.s, 4.5 * p.s, p.z + Math.sin(p.r) * 0.6 * p.s), q, sc.setScalar(p.s * 0.8));
    }, leafColor);

    // --- bushes
    const bushGeo = PropField.jitter(new THREE.IcosahedronGeometry(0.9, 1), 0.3).scale(1.3, 0.8, 1.3).translate(0, 0.55, 0);
    inst(bushGeo, leafMat, this.bushes, (p) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 0, p.z), q, sc.setScalar(p.s));
    }, () => col.setHSL(0.27 + rand() * 0.05, 0.45, 0.22 + rand() * 0.06));

    // --- street lamps
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0);
    const lampMetal = new THREE.MeshStandardMaterial({ color: '#4a5056', metalness: 0.7, roughness: 0.4 });
    inst(poleGeo, lampMetal, this.lamps, (p) => m.compose(v.set(p.x, 0, p.z), q.identity(), sc.setScalar(1)));
    const armGeo = new THREE.BoxGeometry(1.4, 0.08, 0.08).translate(0.7, 6, 0);
    inst(armGeo, lampMetal, this.lamps, (p) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 0, p.z), q, sc.setScalar(1));
    });
    const headGeo = new THREE.BoxGeometry(0.6, 0.12, 0.3).translate(1.35, 5.92, 0);
    const headMat = new THREE.MeshStandardMaterial({ color: '#dddddd', emissive: '#fff2cc', emissiveIntensity: 0.4 });
    inst(headGeo, headMat, this.lamps, (p) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 0, p.z), q, sc.setScalar(1));
    });

    // --- benches
    const seatGeo = new THREE.BoxGeometry(1.9, 0.08, 0.5).translate(0, 0.45, 0);
    const backGeo = new THREE.BoxGeometry(1.9, 0.45, 0.06).translate(0, 0.8, -0.24);
    const legGeo = new THREE.BoxGeometry(1.7, 0.42, 0.42).translate(0, 0.21, 0);
    const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.7 });
    const place = (p: P) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(v.set(p.x, 0, p.z), q, sc.setScalar(1));
    };
    inst(seatGeo, woodMat, this.benches, place);
    inst(backGeo, woodMat, this.benches, place);
    inst(legGeo, lampMetal, this.benches, place);
  }
}
