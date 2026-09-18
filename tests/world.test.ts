import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Noise2D } from "../src/core/noise";
import { angleDiff } from "../src/core/math";
import { World } from "../src/world/world";
import { MapData } from "../src/world/mapgen";
import { TILE, Tile } from "../src/world/tiles";

function tinyWorld(): World {
  // 6x6 room ringed by walls with a pillar in the middle.
  const w = 6;
  const h = 6;
  const tiles = new Uint8Array(w * h).fill(Tile.Ash);
  for (let i = 0; i < w; i++) {
    tiles[i] = Tile.Wall;
    tiles[(h - 1) * w + i] = Tile.Wall;
    tiles[i * w] = Tile.Wall;
    tiles[i * w + w - 1] = Tile.Wall;
  }
  tiles[3 * w + 3] = Tile.Rock;
  const map: MapData = { w, h, tiles, hearth: { x: 1, y: 1 }, bossDen: { x: 4, y: 4 }, camps: [], chests: [], crystals: [], seed: 0 };
  return new World(map);
}

describe("World collision", () => {
  it("blocks circles that overlap solid tiles", () => {
    const world = tinyWorld();
    expect(world.circleBlocked(1.5 * TILE, 1.5 * TILE, 10)).toBe(false);
    expect(world.circleBlocked(3.5 * TILE, 3.5 * TILE, 10)).toBe(true);
    expect(world.circleBlocked(TILE + 4, 1.5 * TILE, 10)).toBe(true);
  });

  it("slides along walls instead of stopping dead", () => {
    const world = tinyWorld();
    const start = { x: 1.5 * TILE, y: 2.5 * TILE };
    const moved = world.moveCircle(start.x, start.y, 10, -50, 20);
    expect(moved.hitX).toBe(true);
    expect(moved.hitY).toBe(false);
    expect(moved.y).toBeCloseTo(start.y + 20);
    expect(moved.x).toBeGreaterThanOrEqual(TILE + 10 - 0.001);
  });

  it("line of sight is blocked by the pillar", () => {
    const world = tinyWorld();
    expect(world.hasLineOfSight(1.5 * TILE, 3.5 * TILE, 4.5 * TILE, 3.5 * TILE)).toBe(false);
    expect(world.hasLineOfSight(1.5 * TILE, 1.5 * TILE, 4.5 * TILE, 1.5 * TILE)).toBe(true);
  });

  it("finds open ground near a blocked tile", () => {
    const world = tinyWorld();
    const p = world.findOpenNear(3, 3, 10);
    expect(world.circleBlocked(p.x, p.y, 10)).toBe(false);
  });
});

describe("core utilities", () => {
  it("rng is deterministic and in range", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    for (let i = 0; i < 100; i++) {
      const n = a.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("noise stays within [0, 1] and is continuous", () => {
    const n = new Noise2D(7);
    let prev = n.fbm(0, 0);
    for (let i = 1; i < 500; i++) {
      const v = n.fbm(i * 0.01, i * 0.013);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.2);
      prev = v;
    }
  });

  it("angleDiff wraps correctly", () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(Math.abs(angleDiff(3, -3))).toBeLessThan(0.3);
  });
});
