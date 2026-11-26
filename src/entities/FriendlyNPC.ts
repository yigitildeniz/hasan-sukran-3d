import * as THREE from 'three';
import { assets } from '../systems/AssetLoader';
import { nameTagTexture } from '../world/textures';
import { CharacterModel, type CharacterLook } from './Character';

export interface FriendlySpec {
  id: string;
  name: string;
  role: string;
  color: string;
  modelKey: string;
  look: CharacterLook;
  pos: THREE.Vector3;
  heading: number;
  sit?: boolean;
}

/** Friendly schoolmates, teacher and neighbourhood characters (Sefa, Betül, Mihrican, Mert, Simitçi Amca). */
export class FriendlyNPC {
  readonly id: string;
  readonly name: string;
  readonly pos: THREE.Vector3;
  readonly model: CharacterModel;
  private sit: boolean;
  private baseHeading: number;

  constructor(spec: FriendlySpec, scene: THREE.Scene) {
    this.id = spec.id;
    this.name = spec.name;
    this.pos = spec.pos.clone();
    this.sit = !!spec.sit;
    this.baseHeading = spec.heading;

    this.model = new CharacterModel(spec.look);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.baseHeading;
    scene.add(this.model.root);

    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture(spec.name, spec.role, spec.color), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.75, 0.44, 1);
    tag.position.set(0, this.sit ? 1.85 : 2.15, 0);
    tag.userData.keepOnSwap = true;
    this.model.root.add(tag);

    assets.swapIn(spec.modelKey, this.model.body);
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const dist = this.pos.distanceTo(playerPos);
    if (!this.sit && dist < 8) {
      const target = Math.atan2(-(playerPos.x - this.pos.x), -(playerPos.z - this.pos.z));
      const diff = THREE.MathUtils.euclideanModulo(target - this.model.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.model.root.rotation.y += diff * (1 - Math.exp(-dt * 5));
    }
    this.model.update(dt, 0, { sit: this.sit, wave: !this.sit && dist < 6 && dist > 1.8 });
  }
}
