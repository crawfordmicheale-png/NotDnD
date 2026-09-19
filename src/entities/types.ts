import { Item } from "../items/items";

export type Faction = "player" | "enemy";

export type ProjectileKind = "ember" | "acid" | "wardenBolt" | "nova";

export interface Projectile {
  kind: ProjectileKind;
  faction: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  /** Splash radius on impact; 0 for none. */
  aoe: number;
  knockback: number;
  dead: boolean;
}

export type PickupKind = "scrap" | "food" | "shard" | "item";

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  amount: number;
  item?: Item;
  life: number;
  /** Delay before the pickup can be collected (so drops visibly scatter first). */
  grace: number;
  dead: boolean;
}

export interface Chest {
  x: number;
  y: number;
  tier: number;
  opened: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
  size: number;
}
