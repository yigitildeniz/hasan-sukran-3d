import * as THREE from 'three';
import { COLORS } from '../game/config';
import {
  asphaltTexture, dirtTexture, facadeTextures, grassTexture, plainAsphaltTexture, sidewalkTexture,
} from './textures';

/** Shared material library (created once, reused everywhere to keep draw state small). */
function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(p);
}

function interiorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eee8da';
  ctx.fillRect(0, 0, 32, 256);
  ctx.fillStyle = '#86aaa2'; // classic Turkish school two-tone oil paint
  ctx.fillRect(0, 256 * 0.62, 32, 256 * 0.38);
  ctx.fillStyle = '#5e7f78';
  ctx.fillRect(0, 256 * 0.62, 32, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let lib: ReturnType<typeof create> | null = null;

function create() {
  const [terraMap, terraRough] = facadeTextures('terracotta', {
    wall: COLORS.terracotta, wallDark: COLORS.terracottaDark, frame: COLORS.windowFrame,
    win: [0.17, 0.2, 0.83, 0.74], band: '#9a4a33',
  });
  const [terraDarkMap, terraDarkRough] = facadeTextures('terracotta-dark', {
    wall: '#8c4a35', wallDark: '#6a3424', frame: COLORS.windowFrame,
    win: [0.3, 0.12, 0.7, 0.82], band: '#7a3d2b',
  });
  const [brickMap, brickRough] = facadeTextures('brick', {
    wall: COLORS.brick, wallDark: COLORS.brickDark, frame: COLORS.windowFrame,
    win: [0.2, 0.22, 0.8, 0.7], bricks: true,
  });
  const [brickPlainMap] = facadeTextures('brick-plain', {
    wall: COLORS.brick, wallDark: COLORS.brick, frame: COLORS.brick,
    win: [0, 0, 0, 0], bricks: true,
  });
  const walk = sidewalkTexture();
  return {
    terracotta: std({ map: terraMap, roughnessMap: terraRough, roughness: 1, metalness: 0.05 }),
    terracottaDark: std({ map: terraDarkMap, roughnessMap: terraDarkRough, roughness: 1, metalness: 0.05 }),
    brickWindows: std({ map: brickMap, roughnessMap: brickRough, roughness: 1, metalness: 0.03 }),
    brick: std({ map: brickPlainMap, roughness: 0.9 }),
    interior: std({ map: interiorTexture(), roughness: 0.85 }),
    ceiling: std({ color: '#f3f1ea', roughness: 0.95 }),
    roof: std({ color: '#8d8a85', roughness: 0.95 }),
    parapet: std({ color: '#d9cbb5', roughness: 0.8 }),
    stone: std({ color: '#7a6f66', roughness: 0.9 }),
    concrete: std({ color: '#c9c3b8', roughness: 0.9 }),
    floorTile: std({ map: walk, color: '#e3ddd0', roughness: 0.35, metalness: 0.0 }),
    asphalt: std({ map: asphaltTexture(), roughness: 0.92 }),
    asphaltPlain: std({ map: plainAsphaltTexture(), roughness: 0.92 }),
    sidewalk: std({ map: walk, roughness: 0.85 }),
    grass: std({ map: grassTexture(), roughness: 1 }),
    dirt: std({ map: dirtTexture(), roughness: 1 }),
    lotConcrete: std({ map: walk, color: '#bdb6aa', roughness: 0.9 }),
    wood: std({ color: '#8a5a35', roughness: 0.7 }),
    woodLight: std({ color: '#c59a6a', roughness: 0.6 }),
    metal: std({ color: '#5d646b', roughness: 0.4, metalness: 0.8 }),
    metalDark: std({ color: '#2b2f33', roughness: 0.5, metalness: 0.7 }),
    locker: std({ color: '#5f7d93', roughness: 0.45, metalness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#a9c8d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35,
      envMapIntensity: 1.5, depthWrite: false,
    }),
    white: std({ color: '#f2f2ee', roughness: 0.6 }),
    lightPanel: std({ color: '#ffffff', emissive: '#fff8e8', emissiveIntensity: 1.6 }),
    red: std({ color: '#c8102e', roughness: 0.5 }),
    chairBlue: std({ color: '#2f5d8a', roughness: 0.5 }),
    deskTop: std({ color: '#d7c3a0', roughness: 0.55 }),
  };
}

export function materials(): ReturnType<typeof create> {
  if (!lib) lib = create();
  return lib;
}
