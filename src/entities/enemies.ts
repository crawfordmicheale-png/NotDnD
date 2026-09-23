import { Rng } from "../core/rng";
import { angleDiff, angleTo, dist, normalize } from "../core/math";
import { FlowField } from "../world/flowfield";
import { World } from "../world/world";
import { Player } from "./player";
import { Projectile } from "./types";

export type EnemyId = "scav" | "hound" | "husk" | "spitter" | "rust" | "warden";

export type Behavior = "melee" | "lunge" | "ranged" | "boss";

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  r: number;
  attackRange: number;
  attackCooldown: number;
  windup: number;
  armor: number;
  xp: number;
  scrap: [number, number];
  aggroRange: number;
  behavior: Behavior;
  color: string;
  mass: number;
}

export const ENEMY_DEFS: Record<EnemyId, EnemyDef> = {
  scav: { id: "scav", name: "Scav Raider", hp: 32, speed: 108, damage: 8, r: 12, attackRange: 40, attackCooldown: 1.2, windup: 0.5, armor: 0, xp: 12, scrap: [2, 6], aggroRange: 330, behavior: "melee", color: "#b08a5a", mass: 1 },
  hound: { id: "hound", name: "Ash Hound", hp: 20, speed: 175, damage: 6, r: 10, attackRange: 120, attackCooldown: 1.6, windup: 0.4, armor: 0, xp: 10, scrap: [0, 2], aggroRange: 400, behavior: "lunge", color: "#6d5a4d", mass: 0.7 },
  husk: { id: "husk", name: "Glow Husk", hp: 72, speed: 66, damage: 17, r: 14, attackRange: 44, attackCooldown: 1.6, windup: 0.7, armor: 0, xp: 20, scrap: [1, 4], aggroRange: 280, behavior: "melee", color: "#6f8a5c", mass: 1.4 },
  spitter: { id: "spitter", name: "Bile Spitter", hp: 40, speed: 92, damage: 11, r: 13, attackRange: 280, attackCooldown: 2.2, windup: 0.6, armor: 0, xp: 18, scrap: [2, 5], aggroRange: 380, behavior: "ranged", color: "#8b5c9e", mass: 1 },
  rust: { id: "rust", name: "Rustknight", hp: 130, speed: 78, damage: 23, r: 16, attackRange: 50, attackCooldown: 1.5, windup: 0.6, armor: 5, xp: 42, scrap: [6, 12], aggroRange: 300, behavior: "melee", color: "#8a5a3a", mass: 2.5 },
  warden: { id: "warden", name: "The Ash Warden", hp: 1150, speed: 92, damage: 28, r: 30, attackRange: 84, attackCooldown: 1.3, windup: 0.8, armor: 4, xp: 520, scrap: [140, 180], aggroRange: 380, behavior: "boss", color: "#3a2f3d", mass: 8 },
};

/** The largest radius any enemy can have, so neighbour queries know how far to look. */
export const MAX_ENEMY_RADIUS = Object.values(ENEMY_DEFS).reduce((m, d) => Math.max(m, d.r), 0);

export type EnemyState = "idle" | "chase" | "windup" | "attack" | "recover" | "return" | "dead";

export type BossMove = "slam" | "charge" | "volley" | "summon";

export interface Enemy {
  def: EnemyDef;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  damage: number;
  facing: number;
  state: EnemyState;
  timer: number;
  cooldown: number;
  homeX: number;
  homeY: number;
  wanderX: number;
  wanderY: number;
  wanderTimer: number;
  flash: number;
  stun: number;
  /** Knockback velocity, decays quickly. */
  kbx: number;
  kby: number;
  dead: boolean;
  deathTimer: number;
  campIndex: number;
  bossMove: BossMove | null;
  bossPhase: number;
  summonsLeft: number;
  awake: boolean;
  seed: number;
}

export function tierMult(tier: number): { hp: number; dmg: number; xp: number } {
  return { hp: 1 + (tier - 1) * 0.32, dmg: 1 + (tier - 1) * 0.22, xp: 1 + (tier - 1) * 0.35 };
}

export function createEnemy(id: EnemyId, x: number, y: number, tier: number, rng: Rng, campIndex = -1): Enemy {
  const def = ENEMY_DEFS[id];
  const m = tierMult(tier);
  const maxHp = Math.round(def.hp * m.hp);
  return {
    def,
    tier,
    x,
    y,
    vx: 0,
    vy: 0,
    r: def.r,
    hp: maxHp,
    maxHp,
    damage: Math.round(def.damage * m.dmg),
    facing: rng.range(0, Math.PI * 2),
    state: "idle",
    timer: 0,
    cooldown: rng.range(0, 0.8),
    homeX: x,
    homeY: y,
    wanderX: x,
    wanderY: y,
    wanderTimer: rng.range(0, 2),
    flash: 0,
    stun: 0,
    kbx: 0,
    kby: 0,
    dead: false,
    deathTimer: 0,
    campIndex,
    bossMove: null,
    bossPhase: 1,
    summonsLeft: 2,
    awake: id !== "warden",
    seed: rng.next(),
  };
}

/** Everything the enemy AI needs from the game without importing it (avoids a dependency cycle). */
export interface EnemyContext {
  world: World;
  player: Player;
  rng: Rng;
  enemies: Enemy[];
  /** Distance field toward the player, used when an enemy cannot see them. */
  flow: FlowField;
  time: number;
  fireProjectile(p: Projectile): void;
  damagePlayer(amount: number, fromX: number, fromY: number, knockback: number): boolean;
  summon(id: EnemyId, x: number, y: number, tier: number): void;
  onBossEvent(kind: "wake" | "phase" | "slam" | "charge"): void;
  emitDust(x: number, y: number, amount: number): void;
  emitRing(x: number, y: number, radius: number, color: string): void;
}

const LEASH_RANGE = 820;

export function updateEnemy(e: Enemy, dt: number, ctx: EnemyContext): void {
  const { player, world } = ctx;
  if (e.dead) {
    e.deathTimer += dt;
    return;
  }
  e.flash = Math.max(0, e.flash - dt);
  e.cooldown = Math.max(0, e.cooldown - dt);

  // Knockback integration.
  e.x += e.kbx * dt;
  e.y += e.kby * dt;
  const kbDrag = Math.max(0, 1 - 9 * dt);
  e.kbx *= kbDrag;
  e.kby *= kbDrag;
  if (world.circleBlocked(e.x, e.y, e.r)) {
    e.x -= e.kbx * dt;
    e.y -= e.kby * dt;
    e.kbx = 0;
    e.kby = 0;
  }

  if (e.stun > 0) {
    e.stun -= dt;
    return;
  }

  const dToPlayer = dist(e.x, e.y, player.x, player.y);
  const canSee = dToPlayer < e.def.aggroRange && (dToPlayer < 90 || world.hasLineOfSight(e.x, e.y, player.x, player.y));

  if (e.def.behavior === "boss") {
    updateBoss(e, dt, ctx, dToPlayer);
    return;
  }

  switch (e.state) {
    case "idle": {
      if (!player.dead && canSee) {
        e.state = "chase";
        break;
      }
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderTimer = ctx.rng.range(1.5, 4);
        const a = ctx.rng.range(0, Math.PI * 2);
        const rad = ctx.rng.range(0, 80);
        e.wanderX = e.homeX + Math.cos(a) * rad;
        e.wanderY = e.homeY + Math.sin(a) * rad;
      }
      if (dist(e.x, e.y, e.wanderX, e.wanderY) > 6) moveToward(e, e.wanderX, e.wanderY, e.def.speed * 0.35, dt, ctx);
      break;
    }
    case "chase": {
      if (player.dead || dToPlayer > LEASH_RANGE || dist(e.x, e.y, e.homeX, e.homeY) > LEASH_RANGE * 1.4) {
        e.state = "return";
        break;
      }
      // canSee already implies line of sight, so only re-test for enemies chasing from
      // beyond their aggro range - exactly the ones most likely to be behind something.
      const hasLos = canSee || dToPlayer < 90 || world.hasLineOfSight(e.x, e.y, player.x, player.y);
      e.facing = angleTo(e.x, e.y, player.x, player.y);
      if (e.def.behavior === "ranged") {
        const preferred = e.def.attackRange * 0.7;
        if (dToPlayer < preferred - 40) moveToward(e, e.x - (player.x - e.x), e.y - (player.y - e.y), e.def.speed * 0.8, dt, ctx);
        else if (dToPlayer > preferred + 40) pursue(e, e.def.speed, dt, ctx, hasLos);
        else strafe(e, player, e.def.speed * 0.5, dt, ctx);
        if (e.cooldown <= 0 && dToPlayer < e.def.attackRange && world.hasLineOfSight(e.x, e.y, player.x, player.y)) {
          e.state = "windup";
          e.timer = e.def.windup;
        }
      } else if (e.def.behavior === "lunge") {
        if (e.cooldown <= 0 && dToPlayer < e.def.attackRange && dToPlayer > 30 && world.hasLineOfSight(e.x, e.y, player.x, player.y)) {
          e.state = "windup";
          e.timer = e.def.windup;
        } else {
          pursue(e, e.def.speed, dt, ctx, hasLos);
        }
      } else {
        if (dToPlayer <= e.def.attackRange + player.r) {
          if (e.cooldown <= 0) {
            e.state = "windup";
            e.timer = e.def.windup;
          } else {
            // Circle a little while waiting to swing so groups don't stack.
            strafe(e, player, e.def.speed * 0.4, dt, ctx);
          }
        } else {
          pursue(e, e.def.speed, dt, ctx, hasLos);
        }
      }
      break;
    }
    case "windup": {
      e.timer -= dt;
      // Track slowly during windup; the last 40% is committed.
      if (e.timer > e.def.windup * 0.4) e.facing = angleTo(e.x, e.y, player.x, player.y);
      if (e.timer <= 0) {
        e.state = "attack";
        if (e.def.behavior === "melee") {
          e.timer = 0.12;
          const reach = e.def.attackRange + player.r + 6;
          const within = dToPlayer <= reach && Math.abs(angleDiff(e.facing, angleTo(e.x, e.y, player.x, player.y))) < 1.1;
          if (within) ctx.damagePlayer(e.damage, e.x, e.y, 180);
          ctx.emitDust(e.x + Math.cos(e.facing) * e.def.attackRange * 0.6, e.y + Math.sin(e.facing) * e.def.attackRange * 0.6, 3);
        } else if (e.def.behavior === "lunge") {
          e.timer = 0.28;
          const n = normalize(player.x - e.x, player.y - e.y);
          e.vx = n.x * 480;
          e.vy = n.y * 480;
        } else if (e.def.behavior === "ranged") {
          e.timer = 0.2;
          const a = angleTo(e.x, e.y, player.x, player.y) + ctx.rng.range(-0.08, 0.08);
          ctx.fireProjectile({
            kind: "acid",
            faction: "enemy",
            x: e.x + Math.cos(a) * e.r,
            y: e.y + Math.sin(a) * e.r,
            vx: Math.cos(a) * 260,
            vy: Math.sin(a) * 260,
            r: 6,
            damage: e.damage,
            life: 2.2,
            aoe: 0,
            knockback: 90,
            dead: false,
          });
        }
        e.cooldown = e.def.attackCooldown * ctx.rng.range(0.9, 1.2);
      }
      break;
    }
    case "attack": {
      e.timer -= dt;
      if (e.def.behavior === "lunge") {
        const moved = world.moveCircle(e.x, e.y, e.r, e.vx * dt, e.vy * dt);
        e.x = moved.x;
        e.y = moved.y;
        if (moved.hitX || moved.hitY) e.timer = 0;
        if (dist(e.x, e.y, player.x, player.y) < e.r + player.r + 4) {
          if (ctx.damagePlayer(e.damage, e.x, e.y, 220)) e.timer = 0;
        }
        e.vx *= Math.max(0, 1 - 2 * dt);
        e.vy *= Math.max(0, 1 - 2 * dt);
      }
      if (e.timer <= 0) {
        e.vx = 0;
        e.vy = 0;
        e.state = "recover";
        e.timer = e.def.behavior === "lunge" ? 0.5 : 0.3;
      }
      break;
    }
    case "recover": {
      e.timer -= dt;
      if (e.timer <= 0) e.state = "chase";
      break;
    }
    case "return": {
      if (!player.dead && canSee && dToPlayer < e.def.aggroRange * 0.8) {
        e.state = "chase";
        break;
      }
      if (dist(e.x, e.y, e.homeX, e.homeY) < 20) {
        e.state = "idle";
        break;
      }
      moveToward(e, e.homeX, e.homeY, e.def.speed * 0.7, dt, ctx);
      // Regenerate while disengaged so kiting isn't free.
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15 * dt);
      break;
    }
    case "dead":
      break;
  }
}

/**
 * Close on the player. With line of sight, steering straight is smoother and reads better;
 * without it, follow the flow field so walls get walked around rather than leaned on.
 * An empty field (player out of range, or standing somewhere unreachable) falls back to
 * the old direct steering, which is no worse than before.
 */
function pursue(e: Enemy, speed: number, dt: number, ctx: EnemyContext, hasLos: boolean): void {
  if (!hasLos) {
    const wp = ctx.flow.waypoint(e.x, e.y);
    if (wp) {
      moveToward(e, wp.x, wp.y, speed, dt, ctx);
      return;
    }
  }
  moveToward(e, ctx.player.x, ctx.player.y, speed, dt, ctx);
}

function strafe(e: Enemy, player: Player, speed: number, dt: number, ctx: EnemyContext): void {
  const a = angleTo(player.x, player.y, e.x, e.y) + (e.seed > 0.5 ? 0.9 : -0.9);
  const tx = player.x + Math.cos(a) * dist(e.x, e.y, player.x, player.y);
  const ty = player.y + Math.sin(a) * dist(e.x, e.y, player.x, player.y);
  moveToward(e, tx, ty, speed, dt, ctx);
}

/** Steer toward a point with simple obstacle sliding and a fallback perpendicular nudge. */
function moveToward(e: Enemy, tx: number, ty: number, speed: number, dt: number, ctx: EnemyContext): void {
  const n = normalize(tx - e.x, ty - e.y);
  if (n.x === 0 && n.y === 0) return;
  const tileSpeed = ctx.world.speedAt(e.x, e.y);
  const s = speed * (tileSpeed < 1 ? Math.max(0.7, tileSpeed) : 1);
  let dx = n.x * s * dt;
  let dy = n.y * s * dt;
  let moved = ctx.world.moveCircle(e.x, e.y, e.r, dx, dy);
  const intended = Math.abs(dx) + Math.abs(dy);
  const actual = Math.abs(moved.x - e.x) + Math.abs(moved.y - e.y);
  if ((moved.hitX || moved.hitY) && actual < intended * 0.35) {
    // Blocked: try sliding perpendicular in a stable direction.
    const side = e.seed > 0.5 ? 1 : -1;
    dx = -n.y * side * s * dt;
    dy = n.x * side * s * dt;
    const alt = ctx.world.moveCircle(e.x, e.y, e.r, dx, dy);
    if (Math.abs(alt.x - e.x) + Math.abs(alt.y - e.y) > Math.abs(moved.x - e.x) + Math.abs(moved.y - e.y)) moved = alt;
  }
  e.x = moved.x;
  e.y = moved.y;
  if (e.state !== "chase" || e.def.behavior !== "ranged") e.facing = Math.atan2(ty - e.y, tx - e.x);
}

// ---------------------------------------------------------------------------
// The Ash Warden
// ---------------------------------------------------------------------------

function updateBoss(e: Enemy, dt: number, ctx: EnemyContext, dToPlayer: number): void {
  const { player, world } = ctx;
  if (!e.awake) {
    if (!player.dead && dToPlayer < e.def.aggroRange) {
      e.awake = true;
      e.state = "recover";
      e.timer = 1.4;
      ctx.onBossEvent("wake");
    }
    return;
  }
  const hpFrac = e.hp / e.maxHp;
  const phase = hpFrac < 0.33 ? 3 : hpFrac < 0.66 ? 2 : 1;
  if (phase !== e.bossPhase) {
    e.bossPhase = phase;
    ctx.onBossEvent("phase");
    if (e.summonsLeft > 0) {
      e.summonsLeft--;
      e.state = "windup";
      e.bossMove = "summon";
      e.timer = 1.0;
      return;
    }
  }
  const speedMult = 1 + (phase - 1) * 0.2;

  switch (e.state) {
    case "idle":
    case "chase": {
      if (player.dead) {
        e.state = "idle";
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * dt);
        return;
      }
      e.facing = angleTo(e.x, e.y, player.x, player.y);
      if (e.cooldown <= 0) {
        // Pick a move based on distance.
        let move: BossMove;
        if (dToPlayer > 260) move = ctx.rng.chance(0.55) ? "charge" : "volley";
        else if (dToPlayer > 130) move = ctx.rng.chance(0.6) ? "charge" : "volley";
        else move = ctx.rng.chance(0.75) ? "slam" : "charge";
        e.bossMove = move;
        e.state = "windup";
        e.timer = move === "slam" ? e.def.windup : move === "charge" ? 0.6 : 0.7;
        if (move === "charge") ctx.onBossEvent("charge");
      } else {
        moveToward(e, player.x, player.y, e.def.speed * speedMult, dt, ctx);
      }
      break;
    }
    case "windup": {
      e.timer -= dt;
      if (e.bossMove !== "charge" && e.timer > 0.25) e.facing = angleTo(e.x, e.y, player.x, player.y);
      if (e.timer <= 0) {
        e.state = "attack";
        switch (e.bossMove) {
          case "slam": {
            const radius = 120;
            ctx.onBossEvent("slam");
            ctx.emitRing(e.x, e.y, radius, "rgba(255,150,60,0.9)");
            ctx.emitDust(e.x, e.y, 30);
            if (dToPlayer < radius + player.r) ctx.damagePlayer(Math.round(e.damage * 1.3), e.x, e.y, 420);
            e.timer = 0.5;
            break;
          }
          case "charge": {
            const n = normalize(player.x - e.x, player.y - e.y);
            e.vx = n.x * 560;
            e.vy = n.y * 560;
            e.timer = 0.7;
            break;
          }
          case "volley": {
            const base = angleTo(e.x, e.y, player.x, player.y);
            const count = 3 + phase * 2;
            for (let i = 0; i < count; i++) {
              const a = base + ((i - (count - 1) / 2) * 0.22);
              ctx.fireProjectile({
                kind: "wardenBolt",
                faction: "enemy",
                x: e.x + Math.cos(a) * e.r,
                y: e.y + Math.sin(a) * e.r,
                vx: Math.cos(a) * 300,
                vy: Math.sin(a) * 300,
                r: 8,
                damage: Math.round(e.damage * 0.7),
                life: 2.4,
                aoe: 0,
                knockback: 140,
                dead: false,
              });
            }
            e.timer = 0.4;
            break;
          }
          case "summon": {
            const count = 2 + phase;
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2;
              const p = world.findOpenNear(Math.floor((e.x + Math.cos(a) * 90) / 32), Math.floor((e.y + Math.sin(a) * 90) / 32));
              ctx.summon(ctx.rng.chance(0.6) ? "husk" : "hound", p.x, p.y, 3);
            }
            e.timer = 0.6;
            break;
          }
          default:
            e.timer = 0.3;
        }
      }
      break;
    }
    case "attack": {
      e.timer -= dt;
      if (e.bossMove === "charge") {
        const moved = world.moveCircle(e.x, e.y, e.r, e.vx * dt, e.vy * dt);
        e.x = moved.x;
        e.y = moved.y;
        ctx.emitDust(e.x - e.vx * 0.04, e.y - e.vy * 0.04, 1);
        if (moved.hitX || moved.hitY) {
          e.timer = 0;
          ctx.emitDust(e.x, e.y, 12);
        }
        if (dist(e.x, e.y, player.x, player.y) < e.r + player.r + 6) {
          if (ctx.damagePlayer(e.damage, e.x, e.y, 380)) e.timer = Math.min(e.timer, 0.15);
        }
      }
      if (e.timer <= 0) {
        e.vx = 0;
        e.vy = 0;
        e.state = "recover";
        e.timer = e.bossMove === "slam" ? 0.9 : 0.6;
        e.cooldown = e.def.attackCooldown * (1 - (phase - 1) * 0.15);
      }
      break;
    }
    case "recover":
    case "return": {
      e.timer -= dt;
      if (e.timer <= 0) e.state = "chase";
      break;
    }
    case "dead":
      break;
  }
}
