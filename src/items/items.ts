import { Rng } from "../core/rng";

export type Rarity = "scrap" | "worn" | "tempered" | "relic";

export const RARITY: Record<Rarity, { name: string; color: string; mult: number }> = {
  scrap: { name: "Scrap", color: "#a8a29a", mult: 1.0 },
  worn: { name: "Worn", color: "#7fc36e", mult: 1.15 },
  tempered: { name: "Tempered", color: "#5eb7e8", mult: 1.35 },
  relic: { name: "Relic", color: "#e8a53a", mult: 1.65 },
};

export interface WeaponBase {
  id: string;
  name: string;
  damage: number;
  range: number;
  /** Full swing arc in radians. */
  arc: number;
  cooldown: number;
  stamina: number;
  knockback: number;
  /** Minimum camp tier where this base can drop. */
  minTier: number;
  flavor: string;
}

export const WEAPON_BASES: WeaponBase[] = [
  { id: "pipe", name: "Rusted Pipe", damage: 9, range: 46, arc: 1.9, cooldown: 0.38, stamina: 7, knockback: 120, minTier: 1, flavor: "Plumbing, repurposed." },
  { id: "machete", name: "Machete", damage: 13, range: 50, arc: 2.0, cooldown: 0.42, stamina: 8, knockback: 140, minTier: 1, flavor: "Still holds an edge after three centuries." },
  { id: "spear", name: "Rebar Spear", damage: 16, range: 74, arc: 0.85, cooldown: 0.5, stamina: 9, knockback: 210, minTier: 1, flavor: "Reach is life." },
  { id: "chainblade", name: "Chainblade", damage: 8, range: 46, arc: 1.6, cooldown: 0.2, stamina: 5, knockback: 60, minTier: 2, flavor: "A bicycle chain, a hacksaw, and hatred." },
  { id: "axe", name: "Fire Axe", damage: 24, range: 54, arc: 2.4, cooldown: 0.72, stamina: 15, knockback: 260, minTier: 2, flavor: "In case of emergency, break everything." },
  { id: "sledge", name: "Wrecking Sledge", damage: 34, range: 58, arc: 2.6, cooldown: 1.0, stamina: 20, knockback: 360, minTier: 3, flavor: "Diplomacy, for when words fail." },
  { id: "glaive", name: "Glow-etched Glaive", damage: 22, range: 76, arc: 1.5, cooldown: 0.55, stamina: 11, knockback: 220, minTier: 3, flavor: "Hums faintly. Do not ask why." },
];

export interface Weapon {
  kind: "weapon";
  base: WeaponBase;
  rarity: Rarity;
  damage: number;
  range: number;
  arc: number;
  cooldown: number;
  stamina: number;
  knockback: number;
  /** Trader upgrades applied. */
  tempers: number;
}

export interface ArmorBase {
  id: string;
  name: string;
  defense: number;
  speedPenalty: number;
  minTier: number;
}

export const ARMOR_BASES: ArmorBase[] = [
  { id: "rags", name: "Wanderer's Rags", defense: 0, speedPenalty: 0, minTier: 0 },
  { id: "plating", name: "Scrap Plating", defense: 2, speedPenalty: 0.0, minTier: 1 },
  { id: "tire", name: "Tire-tread Mail", defense: 4, speedPenalty: 0.03, minTier: 1 },
  { id: "riot", name: "Riot Shell", defense: 7, speedPenalty: 0.06, minTier: 2 },
  { id: "warden", name: "Warden Plate", defense: 10, speedPenalty: 0.08, minTier: 3 },
];

export interface Armor {
  kind: "armor";
  base: ArmorBase;
  rarity: Rarity;
  defense: number;
  speedPenalty: number;
  tempers: number;
}

export type Item = Weapon | Armor;

export function makeWeapon(base: WeaponBase, rarity: Rarity): Weapon {
  const m = RARITY[rarity].mult;
  return {
    kind: "weapon",
    base,
    rarity,
    damage: Math.round(base.damage * m),
    range: base.range + (rarity === "relic" ? 6 : rarity === "tempered" ? 3 : 0),
    arc: base.arc,
    cooldown: base.cooldown * (rarity === "relic" ? 0.9 : rarity === "tempered" ? 0.95 : 1),
    stamina: base.stamina,
    knockback: base.knockback * (1 + (m - 1) * 0.5),
    tempers: 0,
  };
}

export function makeArmor(base: ArmorBase, rarity: Rarity): Armor {
  const m = RARITY[rarity].mult;
  return {
    kind: "armor",
    base,
    rarity,
    defense: Math.round(base.defense * m),
    speedPenalty: base.speedPenalty,
    tempers: 0,
  };
}

export function itemName(item: Item): string {
  const suffix = item.tempers > 0 ? ` +${item.tempers}` : "";
  return `${RARITY[item.rarity].name} ${item.base.name}${suffix}`;
}

export function temperItem(item: Item): void {
  item.tempers++;
  if (item.kind === "weapon") {
    item.damage = Math.round(item.damage * 1.1 + 1);
    item.knockback *= 1.04;
  } else {
    item.defense += 1;
  }
}

export function temperCost(item: Item): number {
  return 25 + item.tempers * 20;
}

export function rollRarity(rng: Rng, tier: number, luck = 0): Rarity {
  const t = tier + luck;
  const weights = [
    Math.max(5, 60 - t * 12),
    25 + t * 4,
    6 + t * 6,
    1 + t * 2.5,
  ];
  return rng.weighted<Rarity>(["scrap", "worn", "tempered", "relic"], weights);
}

export function rollWeapon(rng: Rng, tier: number, luck = 0): Weapon {
  const pool = WEAPON_BASES.filter((b) => b.minTier <= tier);
  return makeWeapon(rng.pick(pool), rollRarity(rng, tier, luck));
}

export function rollArmor(rng: Rng, tier: number, luck = 0): Armor {
  const pool = ARMOR_BASES.filter((b) => b.minTier >= 1 && b.minTier <= tier);
  return makeArmor(rng.pick(pool), rollRarity(rng, tier, luck));
}

/** A crude "power score" used to hint whether a drop is an upgrade. */
export function itemScore(item: Item): number {
  if (item.kind === "weapon") return (item.damage / item.cooldown) * (0.6 + item.arc * 0.2) + item.range * 0.1;
  return item.defense * 10 - item.speedPenalty * 40;
}
