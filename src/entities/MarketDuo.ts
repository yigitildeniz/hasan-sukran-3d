import * as THREE from 'three';
import type { CollisionWorld } from '../systems/Collision';
import { nameTagTexture, roundRect, signTexture } from '../world/textures';

interface DialoguePair {
  zumra: string;
  nisa: string;
}

const DIALOGUES: DialoguePair[] = [
  {
    zumra: 'Bir kase daha mı alsam? Bu daha 4. noodle’ım!',
    nisa: 'Zümra yeter! Enes Batur yeni video atmış mıdır acaba...',
  },
  {
    zumra: 'Çatalım hiç durmuyor, sıcak noodle çok iyi gidiyor!',
    nisa: 'Enes Batur bu tişörtümü görse kesin çok beğenirdi!',
  },
  {
    zumra: 'Konuşma noodle soğuyor, 5. kaseye geçiyorum!',
    nisa: 'Hayalimde Enes Batur ile Atakent’te vlog çekiyoruz...',
  },
  {
    zumra: 'Kardeşler Market’in bütün noodle stoğu benim!',
    nisa: 'Enes Batur’a abone oldun mu? Ben tüm videolarını izledim!',
  },
];

/**
 * Two outdoor chairs in front of Kardeşler Market's entrance with Zümra and Nisa:
 * - Zümra: shorter, slightly fuller build, light-blonde long hair, green eyes, freckles,
 *   continuous delta-driven noodle-eating animation.
 * - Nisa: noticeably taller, slim build, black hair, "Enes Batur" shirt graphic,
 *   floating Enes Batur thought bubble.
 * - Interactive via [E] when the player approaches.
 */
export class MarketDuo {
  readonly root = new THREE.Group();
  readonly center = new THREE.Vector3(84.7, 0, 13.65);

  // Zümra animated parts
  private zumraRightArm = new THREE.Group();
  private zumraHead = new THREE.Group();
  private zumraNoodleStrand: THREE.Mesh;
  private zumraEatPhase = 0;

  // Nisa animated parts
  private nisaHead = new THREE.Group();
  private nisaThoughtSprite: THREE.Sprite;
  private nisaThoughtBaseY = 2.02;

  // Dynamic speech bubble sprites (shown on [E] interaction)
  private zumraBubble: THREE.Sprite;
  private nisaBubble: THREE.Sprite;
  private bubbleTimer = 0;
  private dialogueIdx = 0;
  private animTime = 0;

  constructor(scene: THREE.Scene, collision: CollisionWorld) {
    // Positioned neatly right beside Kardeşler Market's open door (z: 8.2..11.8 stays 100% clear)
    // and well inside the shopfront promenade (x: 82..86), facing west (-X).
    const chairZ1 = 13.0; // Zümra
    const chairZ2 = 14.35; // Nisa
    const chairX = 85.15;

    this.buildChair(chairX, chairZ1, collision);
    this.buildChair(chairX, chairZ2, collision);

    // ---- ZÜMRA (first chair: shorter, light blonde long hair, green eyes, freckles, fuller build)
    const zumra = this.buildZumra();
    zumra.root.position.set(chairX - 0.04, 0, chairZ1);
    zumra.root.rotation.y = Math.PI / 2; // face -X (towards promenade & parking lot)
    this.zumraRightArm = zumra.rightArm;
    this.zumraHead = zumra.head;
    this.zumraNoodleStrand = zumra.strand;
    this.root.add(zumra.root);

    // ---- NISA (second chair: taller, slim, black hair, "Enes Batur" t-shirt + thought bubble)
    const nisa = this.buildNisa();
    nisa.root.position.set(chairX - 0.04, 0, chairZ2);
    nisa.root.rotation.y = Math.PI / 2;
    this.nisaHead = nisa.head;
    this.nisaThoughtSprite = nisa.thought;
    this.root.add(nisa.root);

    // Interaction speech bubbles (hidden until [E] is pressed)
    this.zumraBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.zumraBubble.scale.set(2.5, 0.72, 1);
    this.zumraBubble.position.set(chairX - 0.1, 1.98, chairZ1);
    this.zumraBubble.visible = false;

    this.nisaBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.nisaBubble.scale.set(2.6, 0.72, 1);
    this.nisaBubble.position.set(chairX - 0.1, 2.38, chairZ2);
    this.nisaBubble.visible = false;

    this.root.add(this.zumraBubble, this.nisaBubble);
    scene.add(this.root);
  }

  getPrompt(playerPos: THREE.Vector3, inVehicle: boolean): string | null {
    if (inVehicle) return null;
    const d = Math.hypot(playerPos.x - this.center.x, playerPos.z - this.center.z);
    return d <= 3.6 ? 'Zümra & Nisa ile konuş' : null;
  }

  tryInteract(
    playerPos: THREE.Vector3,
    inVehicle: boolean,
  ): { zumra: string; nisa: string } | null {
    if (inVehicle) return null;
    const d = Math.hypot(playerPos.x - this.center.x, playerPos.z - this.center.z);
    if (d > 3.6) return null;

    const line = DIALOGUES[this.dialogueIdx % DIALOGUES.length];
    this.dialogueIdx += 1;

    this.setBubbleText(this.zumraBubble, 'Zümra', line.zumra, '#ff8f5c');
    this.setBubbleText(this.nisaBubble, 'Nisa', line.nisa, '#e11d48');
    this.zumraBubble.visible = true;
    this.nisaBubble.visible = true;
    this.nisaThoughtSprite.visible = false;
    this.bubbleTimer = 5.2;

    return line;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const dist = Math.hypot(playerPos.x - this.center.x, playerPos.z - this.center.z);
    this.root.visible = dist < 130;
    if (dist > 85) return;

    this.animTime += dt;

    // 1) Zümra's non-stop delta-based noodle-eating loop
    this.zumraEatPhase += dt * 3.3;
    const cycle = (Math.sin(this.zumraEatPhase) + 1) * 0.5; // 0 = dip in cup, 1 = lift to mouth
    // Right arm lifts fork smoothly from cup to mouth and back
    this.zumraRightArm.rotation.x = 0.55 + cycle * 0.85;
    this.zumraRightArm.rotation.z = -0.18 - cycle * 0.2;
    // Subtle chewing / nodding head bob
    this.zumraHead.rotation.x = 0.14 - cycle * 0.12 + Math.sin(this.zumraEatPhase * 3) * 0.035;
    // Noodle strand stretches slightly as fork lifts from cup
    this.zumraNoodleStrand.scale.y = 0.55 + cycle * 0.85;

    // 2) Nisa's idle daydreaming nod + floating Enes Batur thought bubble
    this.nisaHead.rotation.y = Math.sin(this.animTime * 0.9) * 0.14;
    this.nisaHead.rotation.x = -0.05 + Math.sin(this.animTime * 1.4) * 0.04;
    this.nisaThoughtSprite.position.y = this.nisaThoughtBaseY + Math.sin(this.animTime * 2.2) * 0.05;

    // 3) Speech bubble timer
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.zumraBubble.visible = false;
        this.nisaBubble.visible = false;
        this.nisaThoughtSprite.visible = true;
      }
    }
  }

  private buildChair(x: number, z: number, collision: CollisionWorld): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#2c323b', roughness: 0.45, metalness: 0.65 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#b97a45', roughness: 0.65 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.5), woodMat);
    seat.position.y = 0.46;
    seat.castShadow = seat.receiveShadow = true;

    // Backrest on +X side (against market storefront, facing -X)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.48), woodMat);
    back.position.set(0.24, 0.72, 0);
    back.castShadow = true;

    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.46, 6);
    for (const [lx, lz] of [[-0.22, -0.21], [0.22, -0.21], [-0.22, 0.21], [0.22, 0.21]]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, 0.23, lz);
      g.add(leg);
    }
    const postGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6);
    for (const lz of [-0.21, 0.21]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(0.24, 0.7, lz);
      g.add(post);
    }

    g.add(seat, back);
    this.root.add(g);

    // Tight collider around chair & seated character (keeps doorway at z <= 11.8 completely free)
    collision.addBox(x - 0.38, x + 0.36, 0, 1.35, z - 0.34, z + 0.34, { tag: 'market-chair' });
  }

  /** Zümra: shorter, fuller build, light blonde long hair, green eyes, freckles, noodle cup + fork. */
  private buildZumra(): {
    root: THREE.Group;
    rightArm: THREE.Group;
    head: THREE.Group;
    strand: THREE.Mesh;
  } {
    const root = new THREE.Group();
    const scale = 0.77; // clearly shorter than Nisa (0.97)
    const body = new THREE.Group();
    body.scale.setScalar(scale);
    root.add(body);

    const skin = new THREE.MeshStandardMaterial({ color: '#f2cbb0', roughness: 0.6 });
    const topMat = new THREE.MeshStandardMaterial({ color: '#f2846b', roughness: 0.8 });
    const pantMat = new THREE.MeshStandardMaterial({ color: '#3b4d70', roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#e5c678', roughness: 0.78 }); // light blonde

    const hips = new THREE.Group();
    hips.position.set(0, 0.58, 0.04); // seated on chair
    body.add(hips);

    // Slightly fuller pelvis & thighs
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.28), pantMat);
    hips.add(pelvis);
    for (const lx of [-0.13, 0.13]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 4, 8), pantMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(lx, -0.02, -0.2);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.36, 4, 8), pantMat);
      shin.position.set(lx, -0.28, -0.4);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.26), shoeMat);
      shoe.position.set(lx, -0.52, -0.46);
      hips.add(thigh, shin, shoe);
    }

    // Fuller torso
    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.245, 0.32, 4, 10), topMat);
    chest.scale.set(1.16, 1.0, 0.76);
    chest.position.y = 0.34;
    torso.add(chest);

    // Left arm holding the hot noodle cup
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.3, 0.52, 0);
    leftArm.rotation.set(0.95, 0.18, 0.22);
    const lSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.44, 4, 8), topMat);
    lSleeve.position.y = -0.24;
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin);
    lHand.position.y = -0.48;
    // Noodle cup in left hand
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.08, 0.19, 10),
      new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4 }),
    );
    cup.position.set(0.04, -0.52, -0.04);
    cup.rotation.x = -0.95;
    const noodleTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.04, 10),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.7 }),
    );
    noodleTop.position.set(0.04, -0.44, -0.1);
    noodleTop.rotation.x = -0.95;
    leftArm.add(lSleeve, lHand, cup, noodleTop);
    torso.add(leftArm);

    // Right arm holding fork + curly yellow noodle strand (animated in update())
    const rightArm = new THREE.Group();
    rightArm.position.set(0.3, 0.52, 0);
    const rSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.44, 4, 8), topMat);
    rSleeve.position.y = -0.24;
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin);
    rHand.position.y = -0.48;
    const fork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6),
      new THREE.MeshStandardMaterial({ color: '#d8dee4', metalness: 0.8, roughness: 0.25 }),
    );
    fork.position.set(-0.04, -0.54, -0.08);
    fork.rotation.x = Math.PI / 2;
    const strand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.015, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.6 }),
    );
    strand.position.set(-0.04, -0.59, -0.17);
    rightArm.add(rSleeve, rHand, fork, strand);
    torso.add(rightArm);

    // Head: round face, vivid green eyes, cute freckles, long light-blonde hair
    const head = new THREE.Group();
    head.position.y = 0.65;
    torso.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.1, 8), skin);
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 12), skin);
    skull.scale.set(1.06, 1.04, 1.0);
    skull.position.y = 0.17;
    head.add(neck, skull);

    // Green eyes + tiny dark pupils
    const greenIris = new THREE.MeshStandardMaterial({ color: '#2fa35c', roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.2 });
    for (const ex of [-0.048, 0.048]) {
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), greenIris);
      iris.position.set(ex, 0.19, -0.128);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), pupilMat);
      pupil.position.set(ex, 0.19, -0.142);
      head.add(iris, pupil);
    }

    // Freckles across cheeks & nose bridge
    const freckleMat = new THREE.MeshStandardMaterial({ color: '#b47449', roughness: 0.85 });
    const freckleGeo = new THREE.SphereGeometry(0.006, 5, 4);
    for (const [fx, fy, fz] of [
      [-0.06, 0.155, -0.128], [-0.042, 0.148, -0.134], [-0.072, 0.147, -0.12],
      [0.06, 0.155, -0.128], [0.042, 0.148, -0.134], [0.072, 0.147, -0.12],
      [0, 0.16, -0.139], [-0.016, 0.156, -0.138], [0.016, 0.156, -0.138],
    ]) {
      const f = new THREE.Mesh(freckleGeo, freckleMat);
      f.position.set(fx, fy, fz);
      head.add(f);
    }

    // Long light-blonde hair (top cap + long flowing back + side locks)
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.148, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
    hairTop.scale.set(1.06, 1.06, 1.03);
    hairTop.position.set(0, 0.185, 0.01);
    hairTop.rotation.x = -0.22;
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.1), hairMat);
    hairBack.position.set(0, 0.0, 0.11);
    const lockL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.08), hairMat);
    lockL.position.set(-0.135, 0.06, -0.02);
    const lockR = lockL.clone();
    lockR.position.x = 0.135;
    head.add(hairTop, hairBack, lockL, lockR);

    // Name tag above Zümra
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture('Zümra', 'Sürekli Noodle Yiyor 🍜', '#ff8f5c'), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.55, 0.38, 1);
    tag.position.set(0, 1.56, 0);
    root.add(tag);

    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    return { root, rightArm, head, strand };
  }

  /** Nisa: clearly taller, slim build, black hair, "Enes Batur" shirt graphic + thought bubble. */
  private buildNisa(): {
    root: THREE.Group;
    head: THREE.Group;
    thought: THREE.Sprite;
  } {
    const root = new THREE.Group();
    const scale = 0.97; // clearly taller than Zümra (0.77)
    const body = new THREE.Group();
    body.scale.setScalar(scale);
    root.add(body);

    const skin = new THREE.MeshStandardMaterial({ color: '#ebc3a4', roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: '#1b1d24', roughness: 0.78 });
    const pantMat = new THREE.MeshStandardMaterial({ color: '#272a33', roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.82 }); // black hair

    const hips = new THREE.Group();
    hips.position.set(0, 0.5, 0.04);
    body.add(hips);

    // Slim pelvis & long legs
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.19), pantMat);
    hips.add(pelvis);
    for (const lx of [-0.088, 0.088]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.4, 4, 8), pantMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(lx, -0.01, -0.22);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), pantMat);
      shin.position.set(lx, -0.28, -0.44);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.085, 0.25), shoeMat);
      shoe.position.set(lx, -0.49, -0.5);
      hips.add(thigh, shin, shoe);
    }

    // Slim torso + "Enes Batur" front t-shirt print
    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.38, 4, 10), shirtMat);
    chest.scale.set(0.98, 1.04, 0.6);
    chest.position.y = 0.37;
    torso.add(chest);

    const shirtPrint = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.24),
      new THREE.MeshStandardMaterial({
        map: signTexture(['ENES', 'BATUR', '▶ ★'], {
          w: 320, h: 280, bg: '#1b1d24', fg: '#ff3b4f', border: '#ffffff',
        }),
        roughness: 0.65,
      }),
    );
    shirtPrint.position.set(0, 0.4, -0.106);
    shirtPrint.rotation.y = Math.PI;
    torso.add(shirtPrint);

    // Slim resting arms
    for (const [ax, rz] of [[-0.21, 0.08], [0.21, -0.08]] as const) {
      const arm = new THREE.Group();
      arm.position.set(ax, 0.56, 0);
      arm.rotation.set(0.55, 0, rz);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.5, 4, 8), shirtMat);
      sleeve.position.y = -0.27;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
      hand.position.y = -0.55;
      arm.add(sleeve, hand);
      torso.add(arm);
    }

    // Head with sleek long black hair
    const head = new THREE.Group();
    head.position.y = 0.72;
    torso.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.11, 8), skin);
    neck.position.y = 0.03;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.116, 14, 12), skin);
    skull.scale.set(0.92, 1.1, 0.96);
    skull.position.y = 0.18;
    head.add(neck, skull);

    const eyeMat = new THREE.MeshStandardMaterial({ color: '#181414', roughness: 0.25 });
    for (const ex of [-0.038, 0.038]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), eyeMat);
      eye.position.set(ex, 0.195, -0.108);
      head.add(eye);
    }

    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
    hairTop.scale.set(0.95, 1.12, 1.0);
    hairTop.position.set(0, 0.19, 0.01);
    hairTop.rotation.x = -0.24;
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.08), hairMat);
    hairBack.position.set(0, -0.02, 0.095);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.07), hairMat);
    sideL.position.set(-0.108, 0.06, -0.01);
    const sideR = sideL.clone();
    sideR.position.x = 0.108;
    head.add(hairTop, hairBack, sideL, sideR);

    // Name tag above Nisa
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture('Nisa', 'Enes Batur Hayranı', '#e11d48'), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.55, 0.38, 1);
    tag.position.set(0, 1.72, 0);
    root.add(tag);

    // Floating Enes Batur thought bubble
    const thought = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: thoughtBubbleTexture('Enes Batur ❤️'), transparent: true, depthTest: false }),
    );
    thought.scale.set(1.42, 0.56, 1);
    thought.position.set(0, this.nisaThoughtBaseY, 0);
    root.add(thought);

    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    return { root, head, thought };
  }

  private setBubbleText(sprite: THREE.Sprite, speaker: string, text: string, accent: string): void {
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = speechBubbleTexture(speaker, text, accent);
    mat.needsUpdate = true;
  }
}

function thoughtBubbleTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  // Soft cloud pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  roundRect(ctx, 24, 16, 464, 118, 48);
  ctx.fill();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Little thought dots below
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.beginPath();
  ctx.arc(256, 156, 14, 0, Math.PI * 2);
  ctx.arc(240, 182, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 42px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`💭 ${text}`, 256, 75);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speechBubbleTexture(speaker: string, text: string, accent: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 220;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(13, 17, 25, 0.9)';
  roundRect(ctx, 10, 10, 748, 180, 26);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = 'bold 34px Segoe UI, Arial';
  ctx.textBaseline = 'top';
  ctx.fillText(speaker, 36, 28);

  // Word-wrap up to 2 lines
  ctx.fillStyle = '#f8fafc';
  ctx.font = '32px Segoe UI, Arial';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > 680 && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 36, 78 + i * 44));

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
