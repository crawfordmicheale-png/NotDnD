import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { itemName, itemScore, makeWeapon, RARITY, rollArmor, rollRarity, rollWeapon, temperCost, temperItem, WEAPON_BASES } from "../src/items/items";
import { Player, xpForLevel } from "../src/entities/player";

describe("items", () => {
  it("rarity multiplies weapon damage", () => {
    const base = WEAPON_BASES[0];
    const scrap = makeWeapon(base, "scrap");
    const relic = makeWeapon(base, "relic");
    expect(relic.damage).toBeGreaterThan(scrap.damage);
    expect(relic.damage).toBe(Math.round(base.damage * RARITY.relic.mult));
    expect(itemScore(relic)).toBeGreaterThan(itemScore(scrap));
  });

  it("only rolls weapons allowed at the given tier", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const w = rollWeapon(rng, 1);
      expect(w.base.minTier).toBeLessThanOrEqual(1);
    }
    const rng2 = new Rng(9);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollWeapon(rng2, 4).base.id);
    expect(seen.has("sledge") || seen.has("glaive")).toBe(true);
  });

  it("higher tiers roll better rarities on average", () => {
    const order = { scrap: 0, worn: 1, tempered: 2, relic: 3 };
    const avg = (tier: number) => {
      const rng = new Rng(100 + tier);
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += order[rollRarity(rng, tier)];
      return sum / 2000;
    };
    expect(avg(4)).toBeGreaterThan(avg(1));
  });

  it("tempering improves items and raises the cost", () => {
    const a = rollArmor(new Rng(1), 2);
    const def = a.defense;
    const cost = temperCost(a);
    temperItem(a);
    expect(a.defense).toBe(def + 1);
    expect(temperCost(a)).toBeGreaterThan(cost);
    expect(itemName(a)).toContain("+1");
  });
});

describe("player progression", () => {
  it("xp curve grows monotonically", () => {
    for (let l = 1; l < 30; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it("levels up, grants stat points and lets them be spent", () => {
    const p = new Player();
    const gained = p.gainXp(xpForLevel(1) + xpForLevel(2));
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.statPoints).toBe(2);
    const hp = p.maxHp;
    expect(p.spend("vigor")).toBe(true);
    expect(p.maxHp).toBe(hp + 12);
    expect(p.spend("might")).toBe(true);
    expect(p.spend("might")).toBe(false);
    expect(p.damageMult).toBeCloseTo(1.08);
  });
});
