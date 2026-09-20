import { TILE, Tile, isSolid } from "./tiles";
import { World } from "./world";

/** Distance stored for tiles the breadth-first search never reached. */
export const UNREACHABLE = 0xffff;

export interface Waypoint {
  x: number;
  y: number;
}

/**
 * A breadth-first distance field over the walkable tiles, rebuilt from a moving goal
 * (the player). Enemies that cannot see the goal descend the field instead of pressing
 * straight into whatever wall is between them, so they route around buildings and
 * wrecks rather than grinding along them.
 *
 * The search is four-connected, so a path never squeezes through a diagonal gap between
 * two solid tiles. Gradient descent then reads all eight neighbours for a smoother
 * heading, rejecting diagonal steps whose two orthogonal neighbours are not both open.
 */
export class FlowField {
  readonly w: number;
  readonly h: number;
  /** Steps from the goal tile, or UNREACHABLE. */
  readonly dist: Uint16Array;

  goalTx = -1;
  goalTy = -1;

  private readonly tiles: Uint8Array;
  private readonly queue: Int32Array;

  /**
   * @param radius How many tiles out to expand. Anything past this reads as UNREACHABLE,
   *   so it should comfortably exceed the range over which enemies pursue.
   */
  constructor(world: World, readonly radius = 34) {
    this.w = world.map.w;
    this.h = world.map.h;
    this.tiles = world.map.tiles;
    this.dist = new Uint16Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h);
    this.dist.fill(UNREACHABLE);
  }

  private solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return isSolid(this.tiles[ty * this.w + tx] as Tile);
  }

  /** Rebuild the field around a world-space goal. Cheap enough to run several times a second. */
  rebuild(goalX: number, goalY: number): void {
    const { w, h, dist, queue } = this;
    dist.fill(UNREACHABLE);

    const tx = Math.floor(goalX / TILE);
    const ty = Math.floor(goalY / TILE);
    this.goalTx = tx;
    this.goalTy = ty;
    // A goal outside the map or inside a wall leaves the field empty; callers fall back
    // to steering straight at it.
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    if (this.solidAt(tx, ty)) return;

    let head = 0;
    let tail = 0;
    const start = ty * w + tx;
    dist[start] = 0;
    queue[tail++] = start;

    while (head < tail) {
      const idx = queue[head++];
      const d = dist[idx];
      if (d >= this.radius) continue;
      const cy = (idx / w) | 0;
      const cx = idx - cy * w;
      const nd = d + 1;

      if (cx > 0 && dist[idx - 1] === UNREACHABLE && !this.solidAt(cx - 1, cy)) {
        dist[idx - 1] = nd;
        queue[tail++] = idx - 1;
      }
      if (cx + 1 < w && dist[idx + 1] === UNREACHABLE && !this.solidAt(cx + 1, cy)) {
        dist[idx + 1] = nd;
        queue[tail++] = idx + 1;
      }
      if (cy > 0 && dist[idx - w] === UNREACHABLE && !this.solidAt(cx, cy - 1)) {
        dist[idx - w] = nd;
        queue[tail++] = idx - w;
      }
      if (cy + 1 < h && dist[idx + w] === UNREACHABLE && !this.solidAt(cx, cy + 1)) {
        dist[idx + w] = nd;
        queue[tail++] = idx + w;
      }
    }
  }

  /** Steps from the goal to this tile, or UNREACHABLE. */
  distanceAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return UNREACHABLE;
    return this.dist[ty * this.w + tx];
  }

  /**
   * The centre of the next tile on the way to the goal, or null when this position has no
   * usable downhill neighbour — off the field, already on the goal tile, or unreachable.
   */
  waypoint(wx: number, wy: number): Waypoint | null {
    const { w, h, dist } = this;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;

    const here = dist[ty * w + tx];
    // On the goal tile there is nothing left to route around, and off the field there is
    // nothing to descend. Both cases hand control back to direct steering.
    if (here === UNREACHABLE || here === 0) return null;

    let bestD = here;
    let bx = -1;
    let by = -1;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = tx + ox;
        const ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nd = dist[ny * w + nx];
        if (nd >= bestD) continue;
        // Only step diagonally when both orthogonal neighbours are open, so nothing
        // clips the corner of a wall.
        if (ox !== 0 && oy !== 0 && (this.solidAt(nx, ty) || this.solidAt(tx, ny))) continue;
        bestD = nd;
        bx = nx;
        by = ny;
      }
    }
    if (bx < 0) return null;
    return { x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2 };
  }
}
