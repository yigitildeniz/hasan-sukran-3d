import * as THREE from 'three';
import type { MapFeature } from '../world/types';
import type { AuthorityNPC } from '../entities/AuthorityNPC';
import type { Vehicle } from '../entities/Vehicle';

/**
 * GTA 6-style rotating top-left radar minimap rendered on an HTML5 Canvas.
 * Draws buildings, roads, school yard, park, authority NPCs (with vision cones),
 * drivable vehicles and the active objective marker (clamped to edge when far).
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sortedFeatures: MapFeature[];

  constructor(features: MapFeature[], size = 188) {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.sortedFeatures = [...features].sort((a, b) => a.layer - b.layer);
  }

  render(
    playerPos: THREE.Vector3,
    playerYaw: number,
    inVehicle: boolean,
    npcs: AuthorityNPC[],
    vehicles: Vehicle[],
    target: THREE.Vector3 | null,
    targetColor: string,
    time: number,
  ): void {
    const ctx = this.ctx;
    const size = this.canvas.width / Math.min(window.devicePixelRatio || 1, 2);
    const half = size / 2;
    const scale = inVehicle ? 1.15 : 1.7; // px per metre

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#1b2029';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(half, half);
    // Rotate map so player always faces UP on radar
    ctx.rotate(playerYaw);

    // Draw world geometry relative to player
    for (const f of this.sortedFeatures) {
      const rx0 = (f.x0 - playerPos.x) * scale;
      const rz0 = (f.z0 - playerPos.z) * scale;
      const rw = (f.x1 - f.x0) * scale;
      const rh = (f.z1 - f.z0) * scale;
      if (rx0 + rw < -size || rx0 > size || rz0 + rh < -size || rz0 > size) continue;
      ctx.fillStyle = f.color;
      ctx.fillRect(rx0, rz0, rw, rh);
    }

    // Vehicles
    for (const v of vehicles) {
      if (v.occupied) continue;
      const vx = (v.pos.x - playerPos.x) * scale;
      const vz = (v.pos.z - playerPos.z) * scale;
      if (Math.abs(vx) > size || Math.abs(vz) > size) continue;
      ctx.fillStyle = v.kind === 'car' ? '#6cc4ff' : '#7ef2a6';
      ctx.fillRect(vx - 2.5, vz - 2.5, 5, 5);
    }

    // Authority NPCs + vision cones
    for (const n of npcs) {
      const nx = (n.pos.x - playerPos.x) * scale;
      const nz = (n.pos.z - playerPos.z) * scale;
      if (Math.hypot(nx, nz) > size * 1.1) continue;

      // Vision cone
      ctx.save();
      ctx.translate(nx, nz);
      ctx.rotate(-n.heading - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 14 * scale, -0.75, 0.75);
      ctx.closePath();
      ctx.fillStyle =
        n.state === 'chase'
          ? 'rgba(255, 59, 79, 0.34)'
          : n.state === 'suspicious'
            ? 'rgba(245, 197, 66, 0.28)'
            : 'rgba(255, 255, 255, 0.14)';
      ctx.fill();
      ctx.restore();

      // Dot
      const pulse = n.state === 'chase' ? 4.5 + Math.sin(time * 12) * 1.4 : 4;
      ctx.beginPath();
      ctx.arc(nx, nz, pulse, 0, Math.PI * 2);
      ctx.fillStyle = n.state === 'chase' ? '#ff3b4f' : n.state === 'suspicious' ? '#f5c542' : '#ff8668';
      ctx.fill();
      ctx.strokeStyle = '#0c0f15';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Objective target (clamped to radar perimeter if off-screen)
    if (target) {
      let tx = (target.x - playerPos.x) * scale;
      let tz = (target.z - playerPos.z) * scale;
      const maxR = half - 14;
      const d = Math.hypot(tx, tz);
      if (d > maxR) {
        tx = (tx / d) * maxR;
        tz = (tz / d) * maxR;
      }
      const r = 5 + Math.sin(time * 6) * 1.4;
      ctx.beginPath();
      ctx.arc(tx, tz, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(tx, tz, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = targetColor;
      ctx.fill();
    }

    ctx.restore();

    // Player arrow in center
    ctx.save();
    ctx.translate(half, half);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0e131b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
