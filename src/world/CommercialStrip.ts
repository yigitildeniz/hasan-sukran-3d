import * as THREE from 'three';
import { materials } from './materials';
import { facadeTextures, signTexture, worldUVBox } from './textures';
import { boxMM, groundPlane, type WorldContext } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface StationerySpot {
  id: string;
  name: string;
  price: number;
  pos: THREE.Vector3;
}

export interface KettleVisuals {
  setBoiling: (active: boolean, progress: number, time: number) => void;
}

export interface CommercialSpots {
  stationery: StationerySpot[];
  manavKasap: THREE.Vector3;
  noodleShelf: THREE.Vector3;
  kettleStation: THREE.Vector3;
  kettleVisuals: KettleVisuals;
  parkingCenter: THREE.Vector3;
}

/**
 * Long 5-storey apartment + ground-floor commercial strip immediately east of
 * Hasan Şükran Saruhan Ortaokulu (x: [62, 140], z: [-40, 26]):
 *
 * - Front car parking lot (x: 62..82, z: -32..22) with clear driveways, bay markings & parked cars
 * - Left-to-right ground-floor shops facing the school / parking lot (-X):
 *   1) Aktaş Kırtasiye (walkable interior, buyable stationery items)
 *   2) Manav & Kasap (rich produce & butcher storefront, view-only / non-purchasable)
 *   3) Kardeşler Market (walkable interior, buy noodle + hot-water kettle station)
 */
export function buildCommercialStrip(ctx: WorldContext): CommercialSpots {
  const M = materials();
  const W = 0.3;
  const GF_H = 4.2;
  const UPPER_FLOORS = 4;
  const FLOOR_H = 3.2;
  const ROOF_Y = GF_H + UPPER_FLOORS * FLOOR_H; // 17.0 m

  // Building footprint: 48 m long (z: -30..18), 16 m deep (x: 86..102)
  const BX0 = 86;
  const BX1 = 102;
  const BZ0 = -30;
  const BZ1 = 18;

  // ----------------------------------------------------------------- Block ground & Front Parking Lot
  // Base block sidewalk/concrete
  groundPlane(ctx, 62, 140, -40, 26, 0.006, M.lotConcrete, 3);

  // Parking lot asphalt (x: 62..82, z: -32..22) + smooth south driveway to Atakent Caddesi (z: 22..30)
  const parkMat = new THREE.MeshStandardMaterial({
    map: parkingLotTexture(),
    roughness: 0.9,
  });
  groundPlane(ctx, 62, 82, -32, 22, 0.022, parkMat, 0);
  // South driveway apron connecting parking lot to main avenue cleanly
  groundPlane(ctx, 65, 79, 22, 30, 0.022, M.asphaltPlain, 4);
  // West driveway apron connecting parking lot to school-side avenue (across from school east gate)
  groundPlane(ctx, 58, 62, 6, 20, 0.022, M.asphaltPlain, 4);

  // Flush shopfront tiled promenade (x: 82..86, z: -32..22) — zero step snagging
  groundPlane(ctx, 82, 86, -32, 22, 0.025, M.sidewalk, 1.5);

  // Parking lot signage ("OTOPARK") on north-west corner (clear of driveways)
  const parkPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 8), M.metal);
  parkPole.position.set(62.8, 1.4, 21.2);
  parkPole.castShadow = true;
  const parkBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshStandardMaterial({
      map: signTexture(['P', 'OTOPARK'], { w: 256, h: 256, bg: '#164b9a', fg: '#ffffff', border: '#ffffff' }),
    }),
  );
  parkBoard.position.set(62.8, 2.7, 21.26);
  const parkBoardBack = parkBoard.clone();
  parkBoardBack.rotation.y = Math.PI;
  parkBoardBack.position.z = 21.14;
  ctx.root.add(parkPole, parkBoard, parkBoardBack);

  // Static parked cars neatly inside outer west & north bays (wide 11 m lane stays completely open!)
  addParkedCar(ctx, 66.2, -25.0, Math.PI / 2, '#d5dae0');
  addParkedCar(ctx, 66.2, -14.6, Math.PI / 2, '#2d4a72');
  addParkedCar(ctx, 66.2, -4.2, Math.PI / 2, '#8b2935');
  addParkedCar(ctx, 76.2, -28.4, Math.PI, '#e7e4dc');

  // Minimap entries
  ctx.map.push(
    { x0: 62, z0: -32, x1: 82, z1: 22, color: '#585d66', layer: 3, label: 'OTOPARK' },
    { x0: 82, z0: -32, x1: 86, z1: 22, color: '#cfc7b9', layer: 3 },
    { x0: BX0, z0: BZ0, x1: BX1, z1: BZ1, color: '#d8b794', layer: 5, label: 'DÜKKANLAR' },
  );

  // ----------------------------------------------------------------- Long Building Upper Floors (4 residential floors)
  const [aptMap, aptRough] = facadeTextures('strip-upper', {
    wall: '#e6d8c3',
    wallDark: '#c4b196',
    frame: '#f6f4ef',
    win: [0.22, 0.18, 0.78, 0.74],
    balcony: true,
    band: '#cbb89e',
  });
  const upperMat = new THREE.MeshStandardMaterial({
    map: aptMap,
    roughnessMap: aptRough,
    roughness: 1,
    metalness: 0.04,
  });
  const upperMats = [upperMat, upperMat, M.roof, M.ceiling, upperMat, upperMat];
  boxMM(
    ctx,
    BX0,
    BX1,
    GF_H,
    ROOF_Y,
    BZ0,
    BZ1,
    upperMats,
    { collide: false },
    worldUVBox(BX1 - BX0, ROOF_Y - GF_H, BZ1 - BZ0, 3.6, FLOOR_H),
  );
  // Register collider ONLY for upper floors so ground-floor shop entrances remain wide open
  ctx.collision.addBox(BX0, BX1, GF_H, ROOF_Y, BZ0, BZ1);

  // Horizontal cornice trims & roof parapet
  for (let f = 0; f <= UPPER_FLOORS; f++) {
    const y = GF_H + f * FLOOR_H;
    boxMM(ctx, BX0 - 0.18, BX0, y - 0.08, y + 0.12, BZ0 - 0.1, BZ1 + 0.1, M.parapet, { collide: false });
  }
  boxMM(ctx, BX0, BX1, ROOF_Y, ROOF_Y + 0.75, BZ0, BZ0 + 0.35, M.parapet, { collide: false });
  boxMM(ctx, BX0, BX1, ROOF_Y, ROOF_Y + 0.75, BZ1 - 0.35, BZ1, M.parapet, { collide: false });
  boxMM(ctx, BX0, BX0 + 0.35, ROOF_Y, ROOF_Y + 0.75, BZ0, BZ1, M.parapet, { collide: false });
  boxMM(ctx, BX1 - 0.35, BX1, ROOF_Y, ROOF_Y + 0.75, BZ0, BZ1, M.parapet, { collide: false });
  boxMM(ctx, 91, 97, ROOF_Y, ROOF_Y + 2.2, -18, -12, M.parapet, { collide: false });
  boxMM(ctx, 91, 97, ROOF_Y, ROOF_Y + 2.2, 4, 10, M.parapet, { collide: false });

  // Ground-floor outer back/side/divider walls
  const shopWallMat = new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.85 });
  const extPlaster = new THREE.MeshStandardMaterial({ color: '#ddd2c1', roughness: 0.88 });
  // Back wall (east), North end wall, South end wall
  boxMM(ctx, BX1 - W, BX1, 0, GF_H, BZ0, BZ1, extPlaster);
  boxMM(ctx, BX0, BX1, 0, GF_H, BZ0, BZ0 + W, extPlaster);
  boxMM(ctx, BX0, BX1, 0, GF_H, BZ1 - W, BZ1, extPlaster);
  // Interior divider walls between the 3 shops (z = -14 and z = +2)
  boxMM(ctx, BX0, BX1, 0, GF_H, -14 - 0.15, -14 + 0.15, shopWallMat);
  boxMM(ctx, BX0, BX1, 0, GF_H, 2 - 0.15, 2 + 0.15, shopWallMat);

  // Shared storefront fascia sign backing along west wall (y: 3.15..4.15)
  boxMM(ctx, BX0 - 0.12, BX0 + 0.05, 3.15, GF_H, BZ0, BZ1, M.metalDark, { collide: false });

  // Helper for ceiling light panels inside walkable shops
  const addLightPanel = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), M.lightPanel);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, GF_H - 0.04, z);
    ctx.root.add(p);
  };

  // =================================================================
  // SHOP 1 (LEFT, z: -30..-14): AKTAŞ KIRTASİYE — Walkable + Buyable
  // =================================================================
  const kDoorZ0 = -23.8;
  const kDoorZ1 = -20.2; // 3.6 m wide clear open entrance!
  groundPlane(ctx, BX0 + W, BX1 - W, BZ0 + W, -14 - 0.15, 0.03, M.floorTile, 1.2);
  // Front wall with large display glass windows flanking the open doorway
  buildShopFrontSegment(ctx, BX0, BZ0 + W, kDoorZ0, GF_H, '#1d4d8f');
  buildShopFrontSegment(ctx, BX0, kDoorZ1, -14 - 0.15, GF_H, '#1d4d8f');
  // Door header above open entrance (collide: false)
  boxMM(ctx, BX0, BX0 + W, 3.1, GF_H, kDoorZ0, kDoorZ1, M.metalDark, { collide: false });

  // Aktaş Kırtasiye signboard facing west (-X)
  const kirtasiyeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15.2, 0.92),
    new THREE.MeshStandardMaterial({
      map: signTexture(['AKTAŞ KIRTASİYE', 'Defter • Kalem • Fotokopi • Okul Malzemeleri'], {
        w: 1200, h: 150, bg: '#153b7a', fg: '#ffffff', border: '#f5c542',
      }),
      emissive: '#0a1c3d',
      roughness: 0.4,
    }),
  );
  kirtasiyeSign.position.set(BX0 - 0.14, 3.66, -22);
  kirtasiyeSign.rotation.y = -Math.PI / 2;
  ctx.root.add(kirtasiyeSign);

  // Lighting inside Aktaş Kırtasiye
  const kirtasiyeLight = new THREE.PointLight(0xfff5e4, 15, 22, 1.3);
  kirtasiyeLight.position.set(93.5, 3.6, -22);
  ctx.root.add(kirtasiyeLight);
  for (const lx of [90, 96]) for (const lz of [-26.5, -22, -17.5]) addLightPanel(lx, lz);

  // Interior walls & decorative shelves along back wall
  boxMM(ctx, 99.8, 101.4, 0, 2.2, -29.2, -14.8, M.woodLight);
  // Colorful book/notebook spines on back shelf
  const spineColors = ['#e04f4f', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];
  for (let i = 0; i < 16; i++) {
    const sm = new THREE.MeshStandardMaterial({ color: spineColors[i % spineColors.length], roughness: 0.55 });
    boxMM(ctx, 99.65, 99.82, 0.95 + (i % 2) * 0.58, 1.38 + (i % 2) * 0.58, -28.6 + i * 0.85, -28.0 + i * 0.85, sm, { collide: false });
  }
  // Checkout counter near south-east corner
  boxMM(ctx, 94.5, 98.2, 0, 0.95, -16.2, -15.0, M.wood);

  // 3 Buyable Stationery Product Stands inside Aktaş Kırtasiye
  const stationery: StationerySpot[] = [
    { id: 'kalem_seti', name: 'Kalem Seti', price: 20, pos: V(91.5, 0, -27.2) },
    { id: 'kareli_defter', name: 'Kareli Defter', price: 25, pos: V(95.8, 0, -22.0) },
    { id: 'silgi_cetvel', name: 'Silgi & Cetvel', price: 15, pos: V(91.5, 0, -16.8) },
  ];
  const standColors = ['#3b82f6', '#f59e0b', '#10b981'];
  stationery.forEach((item, idx) => {
    const p = item.pos;
    boxMM(ctx, p.x - 0.7, p.x + 0.7, 0, 0.88, p.z - 0.5, p.z + 0.5, M.white);
    // Product prop cluster on stand
    const accentMat = new THREE.MeshStandardMaterial({ color: standColors[idx], roughness: 0.45 });
    boxMM(ctx, p.x - 0.45, p.x + 0.45, 0.88, 1.06, p.z - 0.3, p.z + 0.3, accentMat, { collide: false });
    // Mini price tag board
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.34),
      new THREE.MeshStandardMaterial({
        map: signTexture([item.name, `₺${item.price}`], { w: 320, h: 100, bg: '#153b7a', fg: '#ffd166' }),
      }),
    );
    tag.position.set(p.x, 1.38, p.z);
    tag.rotation.y = -Math.PI / 2;
    ctx.root.add(tag);
  });

  // =================================================================
  // SHOP 2 (MIDDLE, z: -14..+2): MANAV & KASAP — Visual Richness, No Buying
  // =================================================================
  // Front wall closed with storefront windows & decorative displays (no purchase allowed)
  buildShopFrontSegment(ctx, BX0, -13.85, 1.85, GF_H, '#2c6e3f');
  groundPlane(ctx, BX0 + W, BX1 - W, -13.85, 1.85, 0.03, M.floorTile, 1.2);

  // Split Manav & Kasap Signboard
  const manavKasapSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15.2, 0.92),
    new THREE.MeshStandardMaterial({
      map: signTexture(['MANAV & KASAP', 'Taze Sebze Meyve  •  Günlük Kasap'], {
        w: 1200, h: 150, bg: '#215c34', fg: '#fff8e7', border: '#b81d2c',
      }),
      emissive: '#142617',
      roughness: 0.4,
    }),
  );
  manavKasapSign.position.set(BX0 - 0.14, 3.66, -6);
  manavKasapSign.rotation.y = -Math.PI / 2;
  ctx.root.add(manavKasapSign);

  // Awnings above Manav (green) and Kasap (burgundy)
  const manavAwning = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.1, 7.6),
    new THREE.MeshStandardMaterial({ color: '#2b8a3e', roughness: 0.65 }),
  );
  manavAwning.position.set(BX0 - 0.72, 2.95, -10);
  manavAwning.rotation.z = 0.2;
  manavAwning.castShadow = true;

  const kasapAwning = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.1, 7.6),
    new THREE.MeshStandardMaterial({ color: '#a61e2a', roughness: 0.65 }),
  );
  kasapAwning.position.set(BX0 - 0.72, 2.95, -2);
  kasapAwning.rotation.z = 0.2;
  kasapAwning.castShadow = true;
  ctx.root.add(manavAwning, kasapAwning);

  // Manav outdoor produce crates (tucked flush against storefront x: 84.9..86.0, leaving 2.9 m wide walkway!)
  const produceColors = ['#d93829', '#f5821f', '#4ca638', '#f2c929', '#8e44ad'];
  for (let i = 0; i < 5; i++) {
    const cz = -13.1 + i * 1.45;
    boxMM(ctx, 84.95, 85.95, 0, 0.78, cz, cz + 1.2, M.woodLight);
    const fruitMat = new THREE.MeshStandardMaterial({ color: produceColors[i], roughness: 0.55 });
    for (let k = 0; k < 6; k++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), fruitMat);
      fruit.position.set(85.22 + (k % 2) * 0.36, 0.86, cz + 0.24 + Math.floor(k / 2) * 0.36);
      fruit.castShadow = true;
      ctx.root.add(fruit);
    }
  }
  // Kasap refrigerated display showcase visible behind glass (z: -5.5..+1.2)
  boxMM(ctx, 87.2, 88.6, 0, 1.05, -5.2, 1.0, M.white, { collide: false });
  const meatMat = new THREE.MeshStandardMaterial({ color: '#b52832', roughness: 0.45 });
  const meatFatMat = new THREE.MeshStandardMaterial({ color: '#f3d5d0', roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    boxMM(ctx, 87.4, 88.3, 1.05, 1.22, -4.6 + i * 1.15, -3.8 + i * 1.15, i % 2 === 0 ? meatMat : meatFatMat, { collide: false });
  }
  const kasapLight = new THREE.PointLight(0xffeedd, 10, 14, 1.4);
  kasapLight.position.set(88.5, 2.8, -2.2);
  ctx.root.add(kasapLight);
  // Small "Şu an satış yok" window notice
  const closedNote = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.45),
    new THREE.MeshStandardMaterial({
      map: signTexture(['ŞU AN SATIŞ YOK', 'Toptan Hazırlık'], { w: 360, h: 110, bg: '#fff5f5', fg: '#9e1c24', border: '#9e1c24' }),
    }),
  );
  closedNote.position.set(BX0 - 0.04, 1.95, -5.8);
  closedNote.rotation.y = -Math.PI / 2;
  ctx.root.add(closedNote);

  // =================================================================
  // SHOP 3 (RIGHT, z: +2..+18): KARDEŞLER MARKET — Walkable + Noodle + Kettle
  // =================================================================
  const mDoorZ0 = 8.2;
  const mDoorZ1 = 11.8; // 3.6 m wide clear open entrance!
  groundPlane(ctx, BX0 + W, BX1 - W, 2 + 0.15, BZ1 - W, 0.03, M.floorTile, 1.2);
  buildShopFrontSegment(ctx, BX0, 2 + 0.15, mDoorZ0, GF_H, '#b81d2c');
  buildShopFrontSegment(ctx, BX0, mDoorZ1, BZ1 - W, GF_H, '#b81d2c');
  boxMM(ctx, BX0, BX0 + W, 3.1, GF_H, mDoorZ0, mDoorZ1, M.metalDark, { collide: false });

  // Kardeşler Market signboard
  const marketSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15.2, 0.92),
    new THREE.MeshStandardMaterial({
      map: signTexture(['KARDEŞLER MARKET', 'Gıda • İçecek • Sıcak Noodle Köşesi'], {
        w: 1200, h: 150, bg: '#c8102e', fg: '#ffffff', border: '#ffd166',
      }),
      emissive: '#38050d',
      roughness: 0.4,
    }),
  );
  marketSign.position.set(BX0 - 0.14, 3.66, 10);
  marketSign.rotation.y = -Math.PI / 2;
  ctx.root.add(marketSign);

  // Lighting inside Kardeşler Market
  const marketLight = new THREE.PointLight(0xfff7ea, 16, 22, 1.3);
  marketLight.position.set(93.5, 3.6, 10);
  ctx.root.add(marketLight);
  for (const lx of [90, 96]) for (const lz of [5.5, 10, 14.5]) addLightPanel(lx, lz);

  // Market back beverage fridge + grocery aisles
  boxMM(ctx, 100.0, 101.4, 0, 2.4, 3.2, 16.8, M.white);
  boxMM(ctx, 99.9, 100.02, 0.4, 2.2, 4.0, 16.0, M.glass, { collide: false, cast: false });
  // Checkout counter near front-north corner
  boxMM(ctx, 88.2, 90.8, 0, 0.95, 3.2, 4.6, M.red);

  // ---- NOODLE RAFI (Buyable Noodle shelf)
  const noodleShelfPos = V(94.6, 0, 5.8);
  boxMM(ctx, 93.2, 96.4, 0, 1.85, 5.2, 6.2, M.metal);
  const noodleCupColors = ['#ef4444', '#f97316', '#facc15', '#22c55e'];
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < 6; c++) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.085, 0.22, 10),
        new THREE.MeshStandardMaterial({ color: noodleCupColors[(c + row) % noodleCupColors.length], roughness: 0.4 }),
      );
      cup.position.set(93.55 + c * 0.48, 0.96 + row * 0.52, 6.08);
      ctx.root.add(cup);
    }
  }
  const noodleBanner = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.52),
    new THREE.MeshStandardMaterial({
      map: signTexture(['NOODLE RAFI  •  ₺30', 'Al ve Sıcak Su Köşesinde Hazırla!'], {
        w: 560, h: 120, bg: '#f97316', fg: '#ffffff', border: '#fffbeb',
      }),
    }),
  );
  noodleBanner.position.set(94.8, 2.22, 6.22);
  ctx.root.add(noodleBanner);

  // ---- SICAK SU / KETTLE KÖŞESİ (Hot-water kettle + cup slot + animated steam!)
  const kettlePos = V(92.0, 0, 15.2);
  boxMM(ctx, 90.4, 93.8, 0, 0.95, 14.7, 16.2, M.woodLight);
  const kettleSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.56),
    new THREE.MeshStandardMaterial({
      map: signTexture(['SICAK SU / KETTLE', 'Noodle İçin Kaynar Su'], {
        w: 560, h: 120, bg: '#1e293b', fg: '#ffd166', border: '#f97316',
      }),
    }),
  );
  kettleSign.position.set(92.1, 2.15, 16.15);
  kettleSign.rotation.y = Math.PI;
  ctx.root.add(kettleSign);

  // 3D Electric Kettle + base LED + Noodle Cup on counter
  const kettleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 16), M.metalDark);
  kettleBase.position.set(91.5, 0.98, 15.3);
  const kettleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.17, 0.36, 16),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.25, metalness: 0.65 }),
  );
  kettleBody.position.set(91.5, 1.19, 15.3);
  kettleBody.castShadow = true;
  const kettleLedMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.4,
  });
  const kettleLed = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 20).rotateX(Math.PI / 2), kettleLedMat);
  kettleLed.position.set(91.5, 1.02, 15.3);

  // Noodle cup sitting beside the kettle (visible while boiling/ready)
  const activeCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.075, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4 }),
  );
  activeCup.position.set(92.15, 1.05, 15.3);
  activeCup.visible = false;

  // Animated 3D rising steam puffs
  const steamGroup = new THREE.Group();
  steamGroup.position.set(91.85, 1.38, 15.3);
  const steamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  const steamPuffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.08 + (i % 2) * 0.03, 8, 6), steamMat);
    puff.visible = false;
    steamGroup.add(puff);
    steamPuffs.push(puff);
  }
  ctx.root.add(kettleBase, kettleBody, kettleLed, activeCup, steamGroup);

  const kettleVisuals: KettleVisuals = {
    setBoiling(active: boolean, progress: number, time: number) {
      activeCup.visible = active || progress >= 1;
      if (active) {
        kettleLedMat.color.set('#ff6b35');
        kettleLedMat.emissive.set('#ff4500');
        kettleLedMat.emissiveIntensity = 1.6 + Math.sin(time * 12) * 0.7;
        // Subtle kettle vibration while boiling
        kettleBody.position.x = 91.5 + Math.sin(time * 42) * 0.008;
        steamPuffs.forEach((puff, i) => {
          puff.visible = true;
          const phase = (time * 0.9 + i / steamPuffs.length) % 1;
          puff.position.set(
            (i % 2 === 0 ? -0.32 : 0.25) + Math.sin(time * 3 + i) * 0.08,
            phase * 0.95,
            Math.cos(time * 2.5 + i) * 0.06,
          );
          const s = 0.5 + phase * 1.4;
          puff.scale.setScalar(s);
        });
      } else {
        kettleBody.position.x = 91.5;
        kettleLedMat.color.set(progress >= 1 ? '#22c55e' : '#38bdf8');
        kettleLedMat.emissive.set(progress >= 1 ? '#16a34a' : '#0284c7');
        kettleLedMat.emissiveIntensity = progress >= 1 ? 1.4 : 0.35;
        for (const puff of steamPuffs) puff.visible = false;
      }
    },
  };

  // ----------------------------------------------------------------- Rear residential buildings on east side of block
  // Keep x: 108..136 nicely populated behind the commercial strip
  const [backMap, backRough] = facadeTextures('strip-back', {
    wall: '#d9cbb8', wallDark: '#b3a38c', frame: '#f4f2ec', win: [0.24, 0.18, 0.76, 0.72], balcony: true, band: '#bfa98e',
  });
  const backMat = new THREE.MeshStandardMaterial({ map: backMap, roughnessMap: backRough, roughness: 1 });
  const backMats = [backMat, backMat, M.roof, M.roof, backMat, backMat];
  for (const [rz0, rz1] of [[-32, -12], [-4, 16]] as const) {
    boxMM(ctx, 112, 134, 0, 15, rz0, rz1, backMats, {}, worldUVBox(22, 15, rz1 - rz0, 3.4, 3.0));
    ctx.map.push({ x0: 112, z0: rz0, x1: 134, z1: rz1, color: '#d8cdb8', layer: 5 });
  }
  // Greenery along back and north border (strictly outside parking lot & driveways!)
  for (const tz of [-35, -18, 0, 18]) ctx.props.addTree(107, tz, 1.05);
  ctx.props.addTree(66, -36, 1.0);
  ctx.props.addTree(78, -36, 1.05);

  // ----------------------------------------------------------------- Zones
  ctx.zones.push(
    { id: 'kirtasiye', label: 'Aktaş Kırtasiye', minX: BX0, maxX: BX1, minZ: BZ0, maxZ: -14 },
    { id: 'manav_kasap', label: 'Manav & Kasap', minX: 82, maxX: BX1, minZ: -14, maxZ: 2 },
    { id: 'kardesler', label: 'Kardeşler Market', minX: BX0, maxX: BX1, minZ: 2, maxZ: BZ1 },
    { id: 'otopark', label: 'Dükkan Önü Otopark', minX: 62, maxX: 86, minZ: -32, maxZ: 22 },
  );

  return {
    stationery,
    manavKasap: V(83.8, 0, -6.0),
    noodleShelf: noodleShelfPos,
    kettleStation: kettlePos,
    kettleVisuals,
    parkingCenter: V(73, 0, -4),
  };
}

/** West-facing shopfront wall segment with lower kickplate and clear display window. */
function buildShopFrontSegment(
  ctx: WorldContext,
  x0: number,
  z0: number,
  z1: number,
  h: number,
  trimColor: string,
): void {
  const M = materials();
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.55 });
  // Lower kickplate (0..0.72)
  boxMM(ctx, x0, x0 + 0.28, 0, 0.72, z0, z1, trimMat);
  // Glass showcase panel (0.72..3.05) — blocks movement, clear visibility inside
  boxMM(ctx, x0 + 0.08, x0 + 0.2, 0.72, 3.05, z0, z1, M.glass, { cast: false, seeThrough: true });
  // Upper transom (3.05..h)
  boxMM(ctx, x0, x0 + 0.28, 3.05, h, z0, z1, trimMat, { collide: false });
}

/** Crisp parking lot canvas texture (20 m wide x 54 m long). */
function parkingLotTexture(): THREE.Texture {
  const W = 512, H = 1380;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#383c42';
  ctx.fillRect(0, 0, W, H);

  // Subtle asphalt grain
  for (let i = 0; i < 16000; i++) {
    const v = 45 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // Helper: local metres x in [0..20] (62..82), z in [0..54] (-32..22)
  const mx = (x: number) => (x / 20) * W;
  const mz = (z: number) => (z / 54) * H;

  ctx.strokeStyle = 'rgba(245, 245, 240, 0.85)';
  ctx.lineWidth = 4;

  // West row parking bays (x: 1.0..6.8, z: 3.5..34.7 -> 6 bays of 5.2 m each)
  for (let i = 0; i <= 6; i++) {
    const y = mz(3.5 + i * 5.2);
    ctx.beginPath();
    ctx.moveTo(mx(1.0), y);
    ctx.lineTo(mx(6.8), y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(mx(1.0), mz(3.5));
  ctx.lineTo(mx(1.0), mz(34.7));
  ctx.stroke();

  // North row parking bays (z: 0.8..6.2, x: 8.6..18.8 -> 3 bays)
  for (let i = 0; i <= 3; i++) {
    const x = mx(8.6 + i * 3.4);
    ctx.beginPath();
    ctx.moveTo(x, mz(0.8));
    ctx.lineTo(x, mz(6.2));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(mx(8.6), mz(0.8));
  ctx.lineTo(mx(18.8), mz(0.8));
  ctx.stroke();

  // Yellow parking curb guide along the west side (leaving open west entrance z: 38..52)
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(mx(0.2), mz(1.5), mx(0.35), mz(35));

  // Painted "OTOPARK" & arrows in the driving lane
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = 'bold 28px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('↑', mx(13.5), mz(48));
  ctx.fillText('P', mx(13.5), mz(26));
  ctx.fillText('↓', mx(13.5), mz(16));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Static decorative parked car with tight AABB collider. */
function addParkedCar(ctx: WorldContext, x: number, z: number, heading: number, color: string): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = heading;

  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.35, clearcoat: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#263847', roughness: 0.1, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.56, 3.9), paint);
  body.position.y = 0.56;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.56, 2.0), paint);
  cabin.position.set(0, 1.12, 0.12);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.75), glass);
  win.position.set(0, 1.12, 0.12);
  g.add(body, cabin, win);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.84, -1.2], [0.84, -1.2], [-0.84, 1.2], [0.84, 1.2]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.3, wz);
    g.add(w);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  ctx.root.add(g);

  // Tight world AABB based on orientation
  const alongX = Math.abs(Math.sin(heading)) > 0.5;
  const hw = alongX ? 1.98 : 0.92;
  const hd = alongX ? 0.92 : 1.98;
  ctx.collision.addBox(x - hw, x + hw, 0, 1.45, z - hd, z + hd, { tag: 'parked-car' });
}
