import { MapData } from "./mapgen";
import { TILE, TILE_INFO, Tile, isSolid } from "./tiles";

/** Wraps generated map data with world-space queries and collision resolution. */
export class World {
  readonly widthPx: number;
  readonly heightPx: number;

  constructor(public readonly map: MapData) {
    this.widthPx = map.w * TILE;
    this.heightPx = map.h * TILE;
  }

  tileAt(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return Tile.Void;
    return this.map.tiles[ty * this.map.w + tx] as Tile;
  }

  setTile(tx: number, ty: number, t: Tile): void {
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return;
    this.map.tiles[ty * this.map.w + tx] = t;
  }

  tileAtWorld(wx: number, wy: number): Tile {
    return this.tileAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  isSolidAt(wx: number, wy: number): boolean {
    return isSolid(this.tileAtWorld(wx, wy));
  }

  speedAt(wx: number, wy: number): number {
    return TILE_INFO[this.tileAtWorld(wx, wy)].speed;
  }

  hazardAt(wx: number, wy: number): number {
    return TILE_INFO[this.tileAtWorld(wx, wy)].hazard;
  }

  /** True if a circle of given radius at (x, y) overlaps any solid tile. */
  circleBlocked(x: number, y: number, r: number): boolean {
    const minTx = Math.floor((x - r) / TILE);
    const maxTx = Math.floor((x + r) / TILE);
    const minTy = Math.floor((y - r) / TILE);
    const maxTy = Math.floor((y + r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!isSolid(this.tileAt(tx, ty))) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /**
   * Move a circle by (dx, dy) with axis-separated sliding collision.
   * Returns the resolved position.
   */
  moveCircle(x: number, y: number, r: number, dx: number, dy: number): { x: number; y: number; hitX: boolean; hitY: boolean } {
    let nx = x + dx;
    let hitX = false;
    let hitY = false;
    if (this.circleBlocked(nx, y, r)) {
      hitX = true;
      // Slide up to the obstacle in small steps.
      const steps = 4;
      nx = x;
      for (let i = 1; i <= steps; i++) {
        const tx = x + (dx * i) / steps;
        if (this.circleBlocked(tx, y, r)) break;
        nx = tx;
      }
    }
    let ny = y + dy;
    if (this.circleBlocked(nx, ny, r)) {
      hitY = true;
      const steps = 4;
      ny = y;
      for (let i = 1; i <= steps; i++) {
        const ty = y + (dy * i) / steps;
        if (this.circleBlocked(nx, ty, r)) break;
        ny = ty;
      }
    }
    return { x: nx, y: ny, hitX, hitY };
  }

  /** Bresenham-ish line of sight test between two world points. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidAt(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  /** Find a non-solid world position near a tile position, spiralling outward. */
  findOpenNear(tx: number, ty: number, r = 14): { x: number; y: number } {
    for (let ring = 0; ring < 12; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const wx = (tx + dx) * TILE + TILE / 2;
          const wy = (ty + dy) * TILE + TILE / 2;
          if (!this.circleBlocked(wx, wy, r)) return { x: wx, y: wy };
        }
      }
    }
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }
}
