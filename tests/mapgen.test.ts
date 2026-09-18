import { describe, expect, it } from "vitest";
import { floodFill, generateMap } from "../src/world/mapgen";
import { Tile, isSolid } from "../src/world/tiles";
import { hashSeed } from "../src/core/rng";

describe("generateMap", () => {
  const seeds = ["ashfall-100", "rustreach-42", "bonegate-7", "glowmire-999", "test"].map(hashSeed);

  it("is deterministic for a given seed", () => {
    const a = generateMap(1234);
    const b = generateMap(1234);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.camps).toEqual(b.camps);
  });

  it("differs across seeds", () => {
    const a = generateMap(1);
    const b = generateMap(2);
    expect(Array.from(a.tiles)).not.toEqual(Array.from(b.tiles));
  });

  for (const seed of seeds) {
    it(`seed ${seed}: the Warden's den, every camp and every chest are reachable from the Hearth`, () => {
      const m = generateMap(seed);
      const reach = floodFill(m.tiles, m.w, m.h, m.hearth);
      expect(reach[m.hearth.y * m.w + m.hearth.x]).toBe(1);
      expect(reach[m.bossDen.y * m.w + m.bossDen.x]).toBe(1);
      for (const c of m.camps) expect(reach[c.y * m.w + c.x]).toBe(1);
      for (const c of m.chests) {
        expect(isSolid(m.tiles[c.y * m.w + c.x] as Tile)).toBe(false);
        expect(reach[c.y * m.w + c.x]).toBe(1);
      }
    });

    it(`seed ${seed}: no walkable tile is unreachable (isolated pockets are sealed)`, () => {
      const m = generateMap(seed);
      const reach = floodFill(m.tiles, m.w, m.h, m.hearth);
      for (let i = 0; i < m.tiles.length; i++) {
        if (!isSolid(m.tiles[i] as Tile)) expect(reach[i]).toBe(1);
      }
    });
  }

  it("places the requested number of camps with increasing tiers toward the den", () => {
    const m = generateMap(hashSeed("camps"), { camps: 10 });
    expect(m.camps.length).toBe(10);
    const tiers = new Set(m.camps.map((c) => c.tier));
    expect(tiers.has(1)).toBe(true);
    expect(Math.max(...m.camps.map((c) => c.tier))).toBeGreaterThanOrEqual(3);
    for (const c of m.camps) {
      const dHearth = Math.hypot(c.x - m.hearth.x, c.y - m.hearth.y);
      expect(dHearth).toBeGreaterThanOrEqual(22);
    }
  });

  it("keeps a solid border so entities can never leave the map", () => {
    const m = generateMap(77);
    for (let x = 0; x < m.w; x++) {
      expect(isSolid(m.tiles[x] as Tile)).toBe(true);
      expect(isSolid(m.tiles[(m.h - 1) * m.w + x] as Tile)).toBe(true);
    }
    for (let y = 0; y < m.h; y++) {
      expect(isSolid(m.tiles[y * m.w] as Tile)).toBe(true);
      expect(isSolid(m.tiles[y * m.w + m.w - 1] as Tile)).toBe(true);
    }
  });
});
