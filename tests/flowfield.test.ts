import { describe, expect, it } from "vitest";
import { FlowField, UNREACHABLE } from "../src/world/flowfield";
import { MapData } from "../src/world/mapgen";
import { TILE, Tile } from "../src/world/tiles";
import { World } from "../src/world/world";

/** Build a world from an ASCII sketch: '#' is wall, anything else is open ash. */
function worldFrom(rows: string[]): World {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles[y * w + x] = rows[y][x] === "#" ? Tile.Wall : Tile.Ash;
  }
  const map: MapData = {
    w, h, tiles,
    hearth: { x: 0, y: 0 }, bossDen: { x: w - 1, y: h - 1 },
    camps: [], chests: [], crystals: [], seed: 1,
  };
  return new World(map);
}

/** Centre of a tile, in world units. */
const c = (t: number) => t * TILE + TILE / 2;

describe("FlowField distances", () => {
  it("measures four-connected steps from the goal", () => {
    const f = new FlowField(worldFrom(["......", "......", "......"]));
    f.rebuild(c(0), c(0));
    expect(f.distanceAt(0, 0)).toBe(0);
    expect(f.distanceAt(1, 0)).toBe(1);
    expect(f.distanceAt(0, 1)).toBe(1);
    // Diagonals cost two steps, not one — the search is four-connected.
    expect(f.distanceAt(1, 1)).toBe(2);
    expect(f.distanceAt(3, 2)).toBe(5);
  });

  it("routes the long way around a wall rather than through it", () => {
    //  a wall spanning all but the bottom row
    const f = new FlowField(worldFrom([
      "..#...",
      "..#...",
      "..#...",
      "......",
    ]));
    f.rebuild(c(0), c(0));
    // Straight across is 3 tiles, but the only path detours via the open bottom row.
    expect(f.distanceAt(3, 0)).toBe(3 + 3 + 3);
    expect(f.distanceAt(2, 0)).toBe(UNREACHABLE); // the wall itself
  });

  it("leaves sealed-off tiles unreachable", () => {
    const f = new FlowField(worldFrom([
      ".....",
      ".###.",
      ".#.#.",
      ".###.",
      ".....",
    ]));
    f.rebuild(c(0), c(0));
    expect(f.distanceAt(2, 2)).toBe(UNREACHABLE);
    expect(f.distanceAt(4, 4)).not.toBe(UNREACHABLE);
  });

  it("stops expanding past its radius", () => {
    const f = new FlowField(worldFrom(Array(20).fill(".".repeat(20))), 5);
    f.rebuild(c(0), c(0));
    expect(f.distanceAt(5, 0)).toBe(5);
    expect(f.distanceAt(6, 0)).toBe(UNREACHABLE);
  });

  it("produces an empty field for a goal inside a wall", () => {
    const f = new FlowField(worldFrom([".#.", "...", "..."]));
    f.rebuild(c(1), c(0));
    expect(f.distanceAt(0, 0)).toBe(UNREACHABLE);
  });
});

describe("FlowField waypoints", () => {
  it("returns null on the goal tile and off the field", () => {
    const f = new FlowField(worldFrom(["...", "...", "..."]));
    f.rebuild(c(0), c(0));
    expect(f.waypoint(c(0), c(0))).toBeNull();
    expect(f.waypoint(-999, -999)).toBeNull();
  });

  it("walks a blocked pursuer all the way around a wall to the goal", () => {
    const rows = [
      "..#...",
      "..#...",
      "..#...",
      "......",
    ];
    const f = new FlowField(worldFrom(rows));
    f.rebuild(c(0), c(0));

    // Follow the field from the far side of the wall and confirm it arrives.
    let x = c(5);
    let y = c(0);
    const visited: string[] = [];
    for (let step = 0; step < 40; step++) {
      const wp = f.waypoint(x, y);
      if (!wp) break;
      x = wp.x;
      y = wp.y;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      visited.push(`${tx},${ty}`);
      expect(rows[ty][tx]).not.toBe("#"); // never steps into the wall
    }
    expect(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`).toBe("0,0");
    expect(visited).toContain("2,3"); // squeezed through the one gap
  });

  it("never cuts the corner between two diagonally touching walls", () => {
    // (1,1) is open and much closer to the goal than (2,2), but the only way between
    // them is diagonally between the two walls at (2,1) and (1,2). Stepping there would
    // slip an enemy straight through a sealed corner, so it has to be refused even
    // though it looks like the steepest descent.
    const f = new FlowField(worldFrom([
      "....",
      "..#.",
      ".#..",
      "....",
    ]));
    f.rebuild(c(0), c(0));

    expect(f.distanceAt(1, 1)).toBe(2);
    expect(f.distanceAt(2, 2)).toBe(6); // reachable only the long way round
    expect(f.distanceAt(2, 1)).toBe(UNREACHABLE);
    expect(f.distanceAt(1, 2)).toBe(UNREACHABLE);

    const wp = f.waypoint(c(2), c(2));
    expect(wp).not.toBeNull();
    const tx = Math.floor(wp!.x / TILE);
    const ty = Math.floor(wp!.y / TILE);
    expect(`${tx},${ty}`).not.toBe("1,1");
    // It should take the honest orthogonal step instead.
    expect(tx === 2 || ty === 2).toBe(true);
    expect(f.distanceAt(tx, ty)).toBeLessThan(f.distanceAt(2, 2));
  });
});
