import { Armor, ARMOR_BASES, makeArmor, makeWeapon, Weapon, WEAPON_BASES } from "../items/items";

export type StatName = "vigor" | "might" | "agility" | "attunement";

export const STAT_INFO: Record<StatName, { name: string; desc: string }> = {
  vigor: { name: "Vigor", desc: "+12 max health, +0.4 health regen" },
  might: { name: "Might", desc: "+8% melee damage, +5% knockback" },
  agility: { name: "Agility", desc: "+2% move speed, +8 max stamina" },
  attunement: { name: "Attunement", desc: "+10 max glow, +6 spell damage" },
};

export type AttackKind = "light" | "heavy";

export interface PlayerStats {
  vigor: number;
  might: number;
  agility: number;
  attunement: number;
}

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 12;
  facing = 0;

  hp = 100;
  stamina = 100;
  glow = 50;

  stats: PlayerStats = { vigor: 0, might: 0, agility: 0, attunement: 0 };
  level = 1;
  xp = 0;
  statPoints = 0;

  weapon: Weapon = makeWeapon(WEAPON_BASES[0], "scrap");
  armor: Armor = makeArmor(ARMOR_BASES[0], "scrap");
  scrap = 0;
  food = 2;
  shards = 1;

  // Combat state
  attackTimer = 0;
  attackDuration = 0;
  attackKind: AttackKind = "light";
  attackHitPending = false;
  swingDir = 1;
  dodgeTimer = 0;
  dodgeDirX = 0;
  dodgeDirY = 0;
  invulnTimer = 0;
  hitFlash = 0;
  staminaDelay = 0;
  novaCooldown = 0;
  boltCooldown = 0;
  dead = false;

  // Run statistics
  kills = 0;
  deaths = 0;
  campsCleared = 0;

  get maxHp(): number {
    return 90 + this.stats.vigor * 12 + (this.level - 1) * 4;
  }
  get maxStamina(): number {
    return 80 + this.stats.agility * 8;
  }
  get maxGlow(): number {
    return 40 + this.stats.attunement * 10;
  }
  get moveSpeed(): number {
    return 170 * (1 + this.stats.agility * 0.02) * (1 - this.armor.speedPenalty);
  }
  get damageMult(): number {
    return 1 + this.stats.might * 0.08;
  }
  get knockbackMult(): number {
    return 1 + this.stats.might * 0.05;
  }
  get spellDamage(): number {
    return 22 + this.stats.attunement * 6 + (this.level - 1) * 1.5;
  }
  get hpRegen(): number {
    return 0.6 + this.stats.vigor * 0.4;
  }
  get xpToNext(): number {
    return xpForLevel(this.level);
  }
  get isAttacking(): boolean {
    return this.attackTimer > 0;
  }
  get isDodging(): boolean {
    return this.dodgeTimer > 0;
  }
  get isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.dodgeTimer > 0.06;
  }

  /** Reset resources to full (used at spawn and when resting at the Hearth). */
  restore(): void {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.glow = this.maxGlow;
    this.dead = false;
    this.attackTimer = 0;
    this.dodgeTimer = 0;
    this.invulnTimer = 0.5;
  }

  /** Adds XP; returns the number of levels gained. */
  gainXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.statPoints++;
      gained++;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3);
    }
    return gained;
  }

  spend(stat: StatName): boolean {
    if (this.statPoints <= 0) return false;
    this.statPoints--;
    this.stats[stat]++;
    if (stat === "vigor") this.hp += 12;
    return true;
  }
}

export function xpForLevel(level: number): number {
  return Math.floor(45 + level * 30 + level * level * 7);
}
