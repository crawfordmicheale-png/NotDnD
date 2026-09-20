import { describe, expect, it } from "vitest";
import { SpatialGrid } from "../src/core/grid";
import { Rng } from "../src/core/rng";

interface Dot {
  x: number;
  y: number;
  dead?: boolean;
}

/** Everything within `radius` by honest distance — what the grid must not miss. */
function bruteForce(items: Dot[], x: number, y: number, radius: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].dead) continue;
    if (Math.hypot(items[i].x - x, items[i].y - y) <= radius) out.push(i);
  }
  return out;
}

function collect(grid: SpatialGrid, x: number, y: number, radius: number): number[] {
  const out = new Int32Array(1024);
  const n = grid.query(x, y, radius, out);
  return Array.from(out.subarray(0, n)).sort((a, b) => a - b);
}

describe("SpatialGrid", () => {
  it("indexes only the items the predicate accepts", () => {
    const items: Dot[] = [{ x: 10, y: 10 }, { x: 20, y: 20, dead: true }, { x: 30, y: 30 }];
    const grid = new SpatialGrid(640, 640, 64);
    grid.build(items, (d) => !d.dead);
    expect(grid.count).toBe(2);
    expect(collect(grid, 0, 0, 200)).toEqual([0, 2]);
  });

  it("finds every true neighbour, for every point, against brute force", () => {
    const rng = new Rng(20260920);
    const items: Dot[] = [];
    for (let i = 0; i < 400; i++) items.push({ x: rng.range(0, 2000), y: rng.range(0, 1200), dead: rng.chance(0.15) });

    const grid = new SpatialGrid(2000, 1200, 64);
    grid.build(items, (d) => !d.dead);

    for (const item of items) {
      for (const radius of [10, 40, 120]) {
        const expected = bruteForce(items, item.x, item.y, radius);
        const got = collect(grid, item.x, item.y, radius);
        // Cell-granular results are a superset: they must contain every real neighbour,
        // and must never include something the predicate rejected.
        for (const e of expected) expect(got).toContain(e);
        for (const g of got) expect(items[g].dead).toBeFalsy();
      }
    }
  });

  it("keeps items outside the rectangle reachable via the edge cells", () => {
    const items: Dot[] = [{ x: -500, y: -500 }, { x: 99999, y: 99999 }];
    const grid = new SpatialGrid(640, 640, 64);
    grid.build(items);
    expect(grid.count).toBe(2);
    expect(collect(grid, 0, 0, 32)).toContain(0);
    expect(collect(grid, 640, 640, 32)).toContain(1);
  });

  it("clears the previous contents on every rebuild", () => {
    const grid = new SpatialGrid(640, 640, 64);
    grid.build([{ x: 100, y: 100 }, { x: 110, y: 110 }]);
    expect(grid.count).toBe(2);
    grid.build([{ x: 300, y: 300 }]);
    expect(grid.count).toBe(1);
    expect(collect(grid, 100, 100, 40)).toEqual([]);
    expect(collect(grid, 300, 300, 40)).toEqual([0]);
  });

  it("grows past its initial capacity", () => {
    const grid = new SpatialGrid(4000, 4000, 64, 8);
    const items: Dot[] = [];
    for (let i = 0; i < 500; i++) items.push({ x: i * 7, y: i * 3 });
    grid.build(items);
    expect(grid.count).toBe(500);
    expect(collect(grid, 0, 0, 20)).toContain(0);
  });

  it("handles an empty build", () => {
    const grid = new SpatialGrid(640, 640, 64);
    grid.build([]);
    expect(grid.count).toBe(0);
    expect(collect(grid, 100, 100, 100)).toEqual([]);
  });
});
