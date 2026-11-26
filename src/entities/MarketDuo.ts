import * as THREE from 'three';
import type { CollisionWorld } from '../systems/Collision';
import { nameTagTexture, roundRect, signTexture } from '../world/textures';

interface DialoguePair {
  zumra: string;
  nisa: string;
}

export interface MarketDuoCallbacks {
  onEnesSpotted: () => void;
  onNisaFreakout: () => void;
  onPhotoSnap: () => void;
  onSequenceComplete: () => void;
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
    nisa: 'Az önceki fotoğrafı hâlâ inanamadan izliyorum!',
  },
  {
    zumra: 'Kardeşler Market’in bütün noodle stoğu benim!',
    nisa: 'Enes Batur’a abone oldun mu? Ben tüm videolarını izledim!',
  },
];

type EnesPhase = 'idle' | 'approach' | 'freakout' | 'photo' | 'depart' | 'done';

/**
 * Two outdoor chairs in front of Kardeşler Market's entrance with Zümra and Nisa,
 * plus the one-time "Enes Batur walk-by + Nisa freakout + photo flash" special event:
 * - Zümra: shorter than Nisa, slim/slender build, light-blonde long hair, green eyes,
 *   freckles, continuous delta-based noodle-eating animation.
 * - Nisa: clearly taller than Zümra, slim build, black hair, "Enes Batur" shirt graphic,
 *   floating Enes Batur thought bubble.
 */
export class MarketDuo {
  readonly root = new THREE.Group();
  readonly center = new THREE.Vector3(84.7, 0, 13.65);

  private readonly chairX = 85.15;
  private readonly chairZ1 = 13.0; // Zümra
  private readonly chairZ2 = 14.35; // Nisa

  // Zümra animated parts
  private zumraRightArm = new THREE.Group();
  private zumraHead = new THREE.Group();
  private zumraNoodleStrand: THREE.Mesh;
  private zumraEatPhase = 0;

  // Nisa animated parts (supports sitting & jumping in joy!)
  private nisaRoot = new THREE.Group();
  private nisaHead = new THREE.Group();
  private nisaLeftArm = new THREE.Group();
  private nisaRightArm = new THREE.Group();
  private nisaThoughtSprite: THREE.Sprite;
  private nisaThoughtBaseY = 2.02;

  // Enes Batur cameo character (one-time walk-by & photo moment)
  private enesRoot = new THREE.Group();
  private enesLeftLeg = new THREE.Group();
  private enesRightLeg = new THREE.Group();
  private enesLeftArm = new THREE.Group();
  private enesRightArm = new THREE.Group();
  private enesBubble: THREE.Sprite;
  private enesPhase: EnesPhase = 'idle';
  private enesTimer = 0;
  private enesWalkPhase = 0;

  // Dynamic speech bubble sprites
  private zumraBubble: THREE.Sprite;
  private nisaBubble: THREE.Sprite;
  private bubbleTimer = 0;
  private dialogueIdx = 0;
  private animTime = 0;

  constructor(
    scene: THREE.Scene,
    collision: CollisionWorld,
    private cb: MarketDuoCallbacks,
  ) {
    this.buildChair(this.chairX, this.chairZ1, collision);
    this.buildChair(this.chairX, this.chairZ2, collision);

    // ---- ZÜMRA (first chair: shorter, SLIM build, light blonde long hair, green eyes, freckles)
    const zumra = this.buildZumra();
    zumra.root.position.set(this.chairX - 0.04, 0, this.chairZ1);
    zumra.root.rotation.y = Math.PI / 2;
    this.zumraRightArm = zumra.rightArm;
    this.zumraHead = zumra.head;
    this.zumraNoodleStrand = zumra.strand;
    this.root.add(zumra.root);

    // ---- NISA (second chair: taller, slim, black hair, "Enes Batur" shirt + thought bubble)
    const nisa = this.buildNisa();
    nisa.root.position.set(this.chairX - 0.04, 0, this.chairZ2);
    nisa.root.rotation.y = Math.PI / 2;
    this.nisaRoot = nisa.root;
    this.nisaHead = nisa.head;
    this.nisaLeftArm = nisa.leftArm;
    this.nisaRightArm = nisa.rightArm;
    this.nisaThoughtSprite = nisa.thought;
    this.root.add(nisa.root);

    // ---- ENES BATUR (hidden until first proximity trigger)
    const enes = this.buildEnesBatur();
    this.enesRoot = enes.root;
    this.enesLeftLeg = enes.leftLeg;
    this.enesRightLeg = enes.rightLeg;
    this.enesLeftArm = enes.leftArm;
    this.enesRightArm = enes.rightArm;
    this.enesRoot.visible = false;
    this.root.add(this.enesRoot);

    // Speech bubbles
    this.zumraBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.zumraBubble.scale.set(2.5, 0.72, 1);
    this.zumraBubble.position.set(this.chairX - 0.1, 1.98, this.chairZ1);
    this.zumraBubble.visible = false;

    this.nisaBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.nisaBubble.scale.set(2.65, 0.74, 1);
    this.nisaBubble.position.set(this.chairX - 0.1, 2.38, this.chairZ2);
    this.nisaBubble.visible = false;

    this.enesBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.enesBubble.scale.set(2.45, 0.7, 1);
    this.enesBubble.position.set(0, 2.55, 0);
    this.enesBubble.visible = false;
    this.enesRoot.add(this.enesBubble);

    this.root.add(this.zumraBubble, this.nisaBubble);
    scene.add(this.root);
  }

  getPrompt(playerPos: THREE.Vector3, inVehicle: boolean): string | null {
    if (inVehicle) return null;
    // Hide normal [E] prompt while the one-time Enes Batur scene is actively playing
    if (this.enesPhase !== 'idle' && this.enesPhase !== 'done') return null;
    const d = Math.hypot(playerPos.x - this.center.x, playerPos.z - this.center.z);
    return d <= 3.6 ? 'Zümra & Nisa ile konuş' : null;
  }

  tryInteract(
    playerPos: THREE.Vector3,
    inVehicle: boolean,
  ): { zumra: string; nisa: string } | null {
    if (inVehicle) return null;
    if (this.enesPhase !== 'idle' && this.enesPhase !== 'done') return null;
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
    const cycle = (Math.sin(this.zumraEatPhase) + 1) * 0.5;
    this.zumraRightArm.rotation.x = 0.55 + cycle * 0.85;
    this.zumraRightArm.rotation.z = -0.18 - cycle * 0.2;
    this.zumraHead.rotation.x = 0.14 - cycle * 0.12 + Math.sin(this.zumraEatPhase * 3) * 0.035;
    this.zumraNoodleStrand.scale.y = 0.55 + cycle * 0.85;

    // 2) Trigger one-time Enes Batur cameo when player first approaches Nisa
    if (this.enesPhase === 'idle' && dist <= 5.6) {
      this.enesPhase = 'approach';
      this.enesTimer = 0;
      this.enesRoot.visible = true;
      this.enesRoot.position.set(83.25, 0, 7.4);
      this.enesRoot.rotation.y = Math.PI; // walking south (+Z)
      this.cb.onEnesSpotted();
    }

    // 3) Advance Enes Batur special moment state machine
    if (this.enesPhase !== 'idle' && this.enesPhase !== 'done') {
      this.updateEnesSequence(dt);
    } else {
      // Normal Nisa idle daydreaming + floating Enes Batur thought bubble
      this.nisaRoot.position.set(this.chairX - 0.04, 0, this.chairZ2);
      this.nisaHead.rotation.y = Math.sin(this.animTime * 0.9) * 0.14;
      this.nisaHead.rotation.x = -0.05 + Math.sin(this.animTime * 1.4) * 0.04;
      this.nisaLeftArm.rotation.set(0.55, 0, 0.08);
      this.nisaRightArm.rotation.set(0.55, 0, -0.08);
      this.nisaThoughtSprite.position.y = this.nisaThoughtBaseY + Math.sin(this.animTime * 2.2) * 0.05;

      if (this.bubbleTimer > 0) {
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0) {
          this.zumraBubble.visible = false;
          this.nisaBubble.visible = false;
          this.nisaThoughtSprite.visible = true;
        }
      }
    }
  }

  private updateEnesSequence(dt: number): void {
    this.enesTimer += dt;

    if (this.enesPhase === 'approach') {
      const dur = 2.5;
      const t = Math.min(1, this.enesTimer / dur);
      this.enesRoot.position.set(83.25, 0, THREE.MathUtils.lerp(7.4, 13.85, t));
      this.enesRoot.rotation.y = Math.PI;
      this.animateEnesWalk(dt, 1);

      if (t >= 1) {
        this.enesPhase = 'freakout';
        this.enesTimer = 0;
        this.nisaThoughtSprite.visible = false;
        this.setBubbleText(this.nisaBubble, 'Nisa', 'Aha inanamıyorum!! ENES BATUR!!', '#e11d48');
        this.setBubbleText(this.zumraBubble, 'Zümra', 'Nisa dur noodle’ım dökülecek!!', '#ff8f5c');
        this.setBubbleText(this.enesBubble, 'Enes Batur', 'Selam! Gelin bir fotoğraf çekinelim 😄', '#38bdf8');
        this.nisaBubble.visible = true;
        this.zumraBubble.visible = true;
        this.enesBubble.visible = true;
        this.cb.onNisaFreakout();
      }
      return;
    }

    if (this.enesPhase === 'freakout') {
      const dur = 2.1;
      // Nisa leaps into the air with joyful jumping & arm waving!
      const hop = Math.abs(Math.sin(this.enesTimer * 10.5)) * 0.45;
      this.nisaRoot.position.set(this.chairX - 0.55, hop, this.chairZ2);
      this.nisaLeftArm.rotation.set(-2.5 + Math.sin(this.enesTimer * 18) * 0.35, 0, 0.35);
      this.nisaRightArm.rotation.set(-2.5 - Math.sin(this.enesTimer * 18) * 0.35, 0, -0.35);
      this.nisaHead.rotation.y = Math.sin(this.enesTimer * 12) * 0.18;

      // Enes turns toward Nisa and waves
      this.enesRoot.rotation.y = -Math.PI / 2;
      this.animateEnesWalk(dt, 0);
      this.enesRightArm.rotation.set(-2.4, 0, -0.3 + Math.sin(this.enesTimer * 12) * 0.25);

      if (this.enesTimer >= dur) {
        this.enesPhase = 'photo';
        this.enesTimer = 0;
        // Pose side-by-side facing west (-X) for the photo!
        this.enesRoot.position.set(83.9, 0, this.chairZ2 - 0.1);
        this.enesRoot.rotation.y = Math.PI / 2;
        this.nisaRoot.position.set(this.chairX - 0.55, 0.08, this.chairZ2 + 0.15);
        this.setBubbleText(this.nisaBubble, 'Nisa', '📸 EN İYİ GÜNÜM!!', '#e11d48');
        this.setBubbleText(this.enesBubble, 'Enes Batur', 'Harika çıktı, görüşürüz! ✌️', '#38bdf8');
        this.cb.onPhotoSnap();
      }
      return;
    }

    if (this.enesPhase === 'photo') {
      const dur = 2.0;
      // Cute victory pose during photo moment
      this.nisaLeftArm.rotation.set(-2.1, 0, 0.25);
      this.nisaRightArm.rotation.set(-2.1, 0, -0.25);
      this.enesRightArm.rotation.set(-2.2, 0, -0.2);
      this.enesLeftArm.rotation.set(0.2, 0, 0.1);

      if (this.enesTimer >= dur) {
        this.enesPhase = 'depart';
        this.enesTimer = 0;
        this.zumraBubble.visible = false;
        this.nisaBubble.visible = false;
        this.nisaRoot.position.set(this.chairX - 0.04, 0, this.chairZ2);
        this.nisaThoughtSprite.visible = true;
      }
      return;
    }

    if (this.enesPhase === 'depart') {
      const dur = 3.2;
      const t = Math.min(1, this.enesTimer / dur);
      // Enes smiles, turns back and walks away south down the promenade
      this.enesRoot.position.set(83.25, 0, THREE.MathUtils.lerp(this.chairZ2, 24.8, t));
      this.enesRoot.rotation.y = Math.PI;
      this.animateEnesWalk(dt, 1);
      if (t > 0.45) this.enesBubble.visible = false;

      if (t >= 1) {
        this.enesPhase = 'done';
        this.enesRoot.visible = false;
        this.enesBubble.visible = false;
        this.cb.onSequenceComplete();
      }
    }
  }

  private animateEnesWalk(dt: number, amount: number): void {
    this.enesWalkPhase += dt * 7.5 * amount;
    const sw = Math.sin(this.enesWalkPhase) * 0.55 * amount;
    this.enesLeftLeg.rotation.x = sw;
    this.enesRightLeg.rotation.x = -sw;
    this.enesLeftArm.rotation.x = -sw * 0.7;
    this.enesRightArm.rotation.x = sw * 0.7;
  }

  private buildChair(x: number, z: number, collision: CollisionWorld): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#2c323b', roughness: 0.45, metalness: 0.65 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#b97a45', roughness: 0.65 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.5), woodMat);
    seat.position.y = 0.46;
    seat.castShadow = seat.receiveShadow = true;

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

    collision.addBox(x - 0.38, x + 0.36, 0, 1.35, z - 0.34, z + 0.34, { tag: 'market-chair' });
  }

  /** Zümra: shorter than Nisa, SLIM/slender build, light blonde long hair, green eyes, freckles, noodle cup + fork. */
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
    const hairMat = new THREE.MeshStandardMaterial({ color: '#e5c678', roughness: 0.78 });

    const hips = new THREE.Group();
    hips.position.set(0, 0.58, 0.04);
    body.add(hips);

    // Slim/slender pelvis & legs
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.19), pantMat);
    hips.add(pelvis);
    for (const lx of [-0.088, 0.088]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.36, 4, 8), pantMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(lx, -0.02, -0.2);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.36, 4, 8), pantMat);
      shin.position.set(lx, -0.28, -0.4);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.085, 0.24), shoeMat);
      shoe.position.set(lx, -0.5, -0.46);
      hips.add(thigh, shin, shoe);
    }

    // Slim/slender torso
    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.34, 4, 10), topMat);
    chest.scale.set(0.95, 1.0, 0.6);
    chest.position.y = 0.34;
    torso.add(chest);

    // Left arm holding the hot noodle cup
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.21, 0.52, 0);
    leftArm.rotation.set(0.95, 0.18, 0.2);
    const lSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.44, 4, 8), topMat);
    lSleeve.position.y = -0.24;
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
    lHand.position.y = -0.48;
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.075, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4 }),
    );
    cup.position.set(0.04, -0.52, -0.04);
    cup.rotation.x = -0.95;
    const noodleTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.7 }),
    );
    noodleTop.position.set(0.04, -0.44, -0.1);
    noodleTop.rotation.x = -0.95;
    leftArm.add(lSleeve, lHand, cup, noodleTop);
    torso.add(leftArm);

    // Right arm holding fork + curly yellow noodle strand (animated in update())
    const rightArm = new THREE.Group();
    rightArm.position.set(0.21, 0.52, 0);
    const rSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.44, 4, 8), topMat);
    rSleeve.position.y = -0.24;
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
    rHand.position.y = -0.48;
    const fork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6),
      new THREE.MeshStandardMaterial({ color: '#d8dee4', metalness: 0.8, roughness: 0.25 }),
    );
    fork.position.set(-0.04, -0.54, -0.08);
    fork.rotation.x = Math.PI / 2;
    const strand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.014, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.6 }),
    );
    strand.position.set(-0.04, -0.59, -0.17);
    rightArm.add(rSleeve, rHand, fork, strand);
    torso.add(rightArm);

    // Head: slim face, vivid green eyes, cute freckles, long light-blonde hair
    const head = new THREE.Group();
    head.position.y = 0.64;
    torso.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.1, 8), skin);
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), skin);
    skull.scale.set(0.94, 1.08, 0.96);
    skull.position.y = 0.17;
    head.add(neck, skull);

    const greenIris = new THREE.MeshStandardMaterial({ color: '#2fa35c', roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.2 });
    for (const ex of [-0.042, 0.042]) {
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), greenIris);
      iris.position.set(ex, 0.19, -0.112);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), pupilMat);
      pupil.position.set(ex, 0.19, -0.125);
      head.add(iris, pupil);
    }

    const freckleMat = new THREE.MeshStandardMaterial({ color: '#b47449', roughness: 0.85 });
    const freckleGeo = new THREE.SphereGeometry(0.0055, 5, 4);
    for (const [fx, fy, fz] of [
      [-0.052, 0.155, -0.112], [-0.036, 0.148, -0.116], [-0.062, 0.147, -0.104],
      [0.052, 0.155, -0.112], [0.036, 0.148, -0.116], [0.062, 0.147, -0.104],
      [0, 0.16, -0.12], [-0.014, 0.156, -0.119], [0.014, 0.156, -0.119],
    ]) {
      const f = new THREE.Mesh(freckleGeo, freckleMat);
      f.position.set(fx, fy, fz);
      head.add(f);
    }

    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
    hairTop.scale.set(0.96, 1.1, 1.0);
    hairTop.position.set(0, 0.185, 0.01);
    hairTop.rotation.x = -0.22;
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.08), hairMat);
    hairBack.position.set(0, 0.0, 0.095);
    const lockL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.07), hairMat);
    lockL.position.set(-0.112, 0.06, -0.015);
    const lockR = lockL.clone();
    lockR.position.x = 0.112;
    head.add(hairTop, hairBack, lockL, lockR);

    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture('Zümra', 'Sürekli Noodle Yiyor 🍜', '#ff8f5c'), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.55, 0.38, 1);
    tag.position.set(0, 1.54, 0);
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
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    thought: THREE.Sprite;
  } {
    const root = new THREE.Group();
    const scale = 0.97;
    const body = new THREE.Group();
    body.scale.setScalar(scale);
    root.add(body);

    const skin = new THREE.MeshStandardMaterial({ color: '#ebc3a4', roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: '#1b1d24', roughness: 0.78 });
    const pantMat = new THREE.MeshStandardMaterial({ color: '#272a33', roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.82 });

    const hips = new THREE.Group();
    hips.position.set(0, 0.5, 0.04);
    body.add(hips);

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

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.21, 0.56, 0);
    leftArm.rotation.set(0.55, 0, 0.08);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.21, 0.56, 0);
    rightArm.rotation.set(0.55, 0, -0.08);
    for (const arm of [leftArm, rightArm]) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.5, 4, 8), shirtMat);
      sleeve.position.y = -0.27;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
      hand.position.y = -0.55;
      arm.add(sleeve, hand);
      torso.add(arm);
    }

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

    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture('Nisa', 'Enes Batur Hayranı', '#e11d48'), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.55, 0.38, 1);
    tag.position.set(0, 1.72, 0);
    root.add(tag);

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

    return { root, head, leftArm, rightArm, thought };
  }

  /** Enes Batur cameo character: stylish streetwear hoodie, sunglasses/smile, animated walk. */
  private buildEnesBatur(): {
    root: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
    leftArm: THREE.Group;
    rightArm: THREE.Group;
  } {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#e6ba98', roughness: 0.58 });
    const hoodieMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.72 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.5 });
    const pantMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#1f1916', roughness: 0.8 });

    const hips = new THREE.Group();
    hips.position.y = 0.94;
    root.add(hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.21), pantMat);
    hips.add(pelvis);

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.1, 0, 0);
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.1, 0, 0);
    for (const leg of [leftLeg, rightLeg]) {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 4, 8), pantMat);
      l.position.y = -0.44;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.28), shoeMat);
      shoe.position.set(0, -0.88, -0.05);
      leg.add(l, shoe);
      hips.add(leg);
    }

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 4, 10), hoodieMat);
    chest.scale.set(1.06, 1, 0.64);
    chest.position.y = 0.38;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.27), accentMat);
    stripe.position.y = 0.34;
    torso.add(chest, stripe);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.26, 0.58, 0);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.26, 0.58, 0);
    for (const arm of [leftArm, rightArm]) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.52, 4, 8), hoodieMat);
      sleeve.position.y = -0.3;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
      hand.position.y = -0.6;
      arm.add(sleeve, hand);
      torso.add(arm);
    }

    const head = new THREE.Group();
    head.position.y = 0.7;
    torso.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin);
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), skin);
    skull.scale.set(0.95, 1.1, 1);
    skull.position.y = 0.18;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
    hair.position.set(0, 0.2, 0.01);
    hair.rotation.x = -0.22;
    // Stylish sunglasses + bright smile
    const shadesMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.15, metalness: 0.7 });
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.03), shadesMat);
    shades.position.set(0, 0.2, -0.122);
    const smile = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.015, 0.015), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    smile.position.set(0, 0.125, -0.122);
    head.add(neck, skull, hair, shades, smile);

    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture('Enes Batur', 'YouTuber ★', '#38bdf8'), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.75, 0.42, 1);
    tag.position.set(0, 2.15, 0);
    root.add(tag);

    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    return { root, leftLeg, rightLeg, leftArm, rightArm };
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  roundRect(ctx, 24, 16, 464, 118, 48);
  ctx.fill();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 5;
  ctx.stroke();
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
