import { Audio } from "../core/audio";
import { Camera } from "../core/camera";
import { Input } from "../core/input";
import { angleDiff, angleTo, clamp, dist, normalize } from "../core/math";
import { Rng, hashSeed } from "../core/rng";
import { createEnemy, Enemy, EnemyContext, EnemyId, tierMult, updateEnemy } from "../entities/enemies";
import { ParticleSystem } from "../entities/particles";
import { Player, StatName } from "../entities/player";
import { Chest, FloatingText, Pickup, Projectile } from "../entities/types";
import { Item, itemName, itemScore, rollArmor, rollWeapon, temperCost, temperItem, makeArmor, ARMOR_BASES } from "../items/items";
import { drawCampfire, drawChest, drawEnemy, drawPickup, drawPlayer, drawProjectile, drawTrader } from "../render/entities";
import { Camp, generateMap } from "../world/mapgen";
import { TileRenderer } from "../world/renderer";
import { TILE, Tile } from "../world/tiles";
import { World } from "../world/world";
import { drawHud } from "../ui/hud";
import { drawScreens } from "../ui/screens";

export type Screen = "title" | "playing" | "paused" | "character" | "trader" | "dead" | "victory";

export interface Toast {
  text: string;
  life: number;
  color: string;
}

export interface TraderOffer {
  label: string;
  cost: number;
  available: boolean;
  apply: () => void;
}

const CAMP_NAMES: Record<Camp["kind"], string> = {
  scav: "Scav camp",
  hound: "Hound den",
  husk: "Husk gathering",
  rust: "Rustknight patrol",
  mixed: "Warband",
};

const DODGE_TIME = 0.32;
const DODGE_COST = 22;
const BOLT_COST = 18;
const NOVA_COST = 34;
const MAX_ENEMIES = 110;

export class Game {
  ctx: CanvasRenderingContext2D;
  input: Input;
  audio = new Audio();
  camera: Camera;
  rng: Rng;
  seed: number;
  seedName: string;

  world!: World;
  tiles!: TileRenderer;
  player = new Player();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  chests: Chest[] = [];
  particles = new ParticleSystem();
  texts: FloatingText[] = [];
  toasts: Toast[] = [];
  camps: Camp[] = [];
  campAlive: number[] = [];
  campCleared: boolean[] = [];
  campDiscovered: boolean[] = [];

  screen: Screen = "title";
  time = 0;
  runTime = 0;
  boss: Enemy | null = null;
  bossDefeated = false;
  victoryTimer = 0;
  spawnTimer = 20;
  hearth = { x: 0, y: 0 };
  campfire = { x: 0, y: 0 };
  trader = { x: 0, y: 0 };
  /** Nearest interactable prompt for the HUD. */
  prompt: string | null = null;
  nearbyItem: Pickup | null = null;

  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  minimap!: HTMLCanvasElement;
  fog!: HTMLCanvasElement;
  private lastFrame = 0;
  private enemyCtx!: EnemyContext;

  constructor(public canvas: HTMLCanvasElement, seedName?: string) {
    this.ctx = canvas.getContext("2d")!;
    this.input = new Input(canvas);
    this.camera = new Camera(canvas.width, canvas.height);
    this.seedName = seedName ?? randomSeedName();
    this.seed = hashSeed(this.seedName);
    this.rng = new Rng(this.seed ^ 0xabcdef);
    this.lightCanvas = document.createElement("canvas");
    this.lightCtx = this.lightCanvas.getContext("2d")!;
    this.newWorld();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize(): void {
    const scale = Math.min(1, 1600 / window.innerWidth);
    this.canvas.width = Math.floor(window.innerWidth * scale);
    this.canvas.height = Math.floor(window.innerHeight * scale);
    this.camera.resize(this.canvas.width, this.canvas.height);
    this.lightCanvas.width = this.canvas.width;
    this.lightCanvas.height = this.canvas.height;
  }

  // -------------------------------------------------------------------------
  // World setup
  // -------------------------------------------------------------------------

  newWorld(): void {
    const map = generateMap(this.seed);
    this.world = new World(map);
    this.tiles = new TileRenderer(this.world);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.texts = [];
    this.toasts = [];
    this.particles.particles.length = 0;
    this.camps = map.camps;
    this.campAlive = map.camps.map(() => 0);
    this.campCleared = map.camps.map(() => false);
    this.campDiscovered = map.camps.map(() => false);
    this.bossDefeated = false;
    this.boss = null;

    this.hearth = { x: map.hearth.x * TILE + TILE / 2, y: map.hearth.y * TILE + TILE / 2 };
    this.campfire = { x: this.hearth.x, y: this.hearth.y };
    this.trader = { x: this.hearth.x - TILE * 3, y: this.hearth.y - TILE * 3 };

    this.player = new Player();
    const spawn = this.world.findOpenNear(map.hearth.x + 2, map.hearth.y + 1, this.player.r);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.restore();
    this.camera.snapTo(this.player.x, this.player.y);

    this.chests = map.chests.map((c) => ({
      x: c.x * TILE + TILE / 2,
      y: c.y * TILE + TILE / 2,
      tier: 1 + Math.min(3, Math.floor((Math.hypot(c.x - map.hearth.x, c.y - map.hearth.y) / Math.hypot(map.bossDen.x - map.hearth.x, map.bossDen.y - map.hearth.y)) * 3.6)),
      opened: false,
    }));

    for (let i = 0; i < map.camps.length; i++) this.populateCamp(map.camps[i], i);

    const den = this.world.findOpenNear(map.bossDen.x, map.bossDen.y, 30);
    this.boss = this.spawnEnemy("warden", den.x, den.y, 4);

    this.enemyCtx = {
      world: this.world,
      player: this.player,
      rng: this.rng,
      enemies: this.enemies,
      time: 0,
      fireProjectile: (p) => this.projectiles.push(p),
      damagePlayer: (amount, fx, fy, kb) => this.damagePlayer(amount, fx, fy, kb),
      summon: (id, x, y, tier) => {
        const e = this.spawnEnemy(id, x, y, tier);
        e.state = "chase";
        this.particles.burst(x, y, 16, "#8ad3f5", 140, 0.5, 3);
      },
      onBossEvent: (kind) => this.onBossEvent(kind),
      emitDust: (x, y, n) => this.particles.dust(x, y, n),
      emitRing: (x, y, r, c) => this.particles.ring(x, y, r, c, 0.45),
    };

    this.buildMinimap();
    this.spawnTimer = 25;
    this.runTime = 0;
  }

  private populateCamp(camp: Camp, index: number): void {
    const count = 3 + Math.round(camp.tier * 1.4) + this.rng.int(0, 1);
    const pools: Record<Camp["kind"], EnemyId[]> = {
      scav: ["scav", "scav", "scav", "spitter"],
      hound: ["hound", "hound", "hound", "scav"],
      husk: ["husk", "husk", "spitter", "scav"],
      rust: ["rust", "rust", "husk", "spitter"],
      mixed: ["scav", "hound", "husk", "spitter", "rust"],
    };
    for (let i = 0; i < count; i++) {
      const id = this.rng.pick(pools[camp.kind]);
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0.5, camp.radius) * TILE;
      const p = this.world.findOpenNear(Math.floor((camp.x * TILE + Math.cos(a) * r) / TILE), Math.floor((camp.y * TILE + Math.sin(a) * r) / TILE), 16);
      const e = this.spawnEnemy(id, p.x, p.y, camp.tier, index);
      e.homeX = camp.x * TILE + TILE / 2;
      e.homeY = camp.y * TILE + TILE / 2;
      this.campAlive[index]++;
    }
  }

  spawnEnemy(id: EnemyId, x: number, y: number, tier: number, campIndex = -1): Enemy {
    const e = createEnemy(id, x, y, tier, this.rng, campIndex);
    this.enemies.push(e);
    return e;
  }

  private buildMinimap(): void {
    const m = this.world.map;
    this.minimap = document.createElement("canvas");
    this.minimap.width = m.w;
    this.minimap.height = m.h;
    const g = this.minimap.getContext("2d")!;
    const img = g.createImageData(m.w, m.h);
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i] as Tile;
      let c: [number, number, number];
      switch (t) {
        case Tile.Ash: c = [70, 64, 60]; break;
        case Tile.Cracked: c = [100, 82, 62]; break;
        case Tile.Road: c = [55, 54, 58]; break;
        case Tile.RubbleFloor: c = [85, 78, 72]; break;
        case Tile.HearthFloor: c = [120, 105, 90]; break;
        case Tile.Toxic: c = [60, 120, 45]; break;
        case Tile.Bones: c = [130, 122, 105]; break;
        case Tile.Wall: c = [140, 130, 120]; break;
        case Tile.Rock: c = [110, 105, 100]; break;
        case Tile.DeadTree: c = [58, 44, 32]; break;
        case Tile.Wreck: c = [120, 70, 40]; break;
        case Tile.Crystal: c = [120, 200, 240]; break;
        case Tile.Scorched: c = [40, 34, 32]; break;
        default: c = [5, 4, 4];
      }
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.fog = document.createElement("canvas");
    this.fog.width = m.w;
    this.fog.height = m.h;
    const f = this.fog.getContext("2d")!;
    f.fillStyle = "#000";
    f.fillRect(0, 0, m.w, m.h);
  }

  private revealFog(): void {
    const f = this.fog.getContext("2d")!;
    f.globalCompositeOperation = "destination-out";
    f.beginPath();
    f.arc(this.player.x / TILE, this.player.y / TILE, 11, 0, Math.PI * 2);
    f.fill();
    f.globalCompositeOperation = "source-over";
    for (let i = 0; i < this.camps.length; i++) {
      if (this.campDiscovered[i]) continue;
      const c = this.camps[i];
      if (Math.hypot(c.x * TILE - this.player.x, c.y * TILE - this.player.y) < 11 * TILE) {
        this.campDiscovered[i] = true;
        if (!this.campCleared[i]) this.toast(`${CAMP_NAMES[c.kind]} spotted. Tier ${c.tier}.`, "#d67a3a");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  start(): void {
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.update(dt);
      this.render();
      this.input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  update(dt: number): void {
    this.time += dt;
    const input = this.input;
    if (input.anyPressed()) this.audio.unlock();
    if (input.wasPressed("KeyM")) {
      const muted = this.audio.toggleMute();
      this.toast(muted ? "Sound muted" : "Sound on");
    }

    switch (this.screen) {
      case "title":
        if (input.wasPressed("Enter") || input.wasPressed("Space") || input.mousePressed[0]) {
          this.screen = "playing";
          this.toast("Cross the wastes. Kill the Ash Warden.", "#ffd27a");
          this.toast("Rest at the campfire (E) to recover.");
        }
        if (input.wasPressed("KeyN")) {
          this.seedName = randomSeedName();
          this.seed = hashSeed(this.seedName);
          this.rng = new Rng(this.seed ^ 0xabcdef);
          this.newWorld();
        }
        break;
      case "paused":
        if (input.wasPressed("Escape") || input.wasPressed("KeyP")) this.screen = "playing";
        if (input.wasPressed("KeyR")) this.restart();
        break;
      case "character":
        if (input.wasPressed("Tab") || input.wasPressed("Escape") || input.wasPressed("KeyC")) this.screen = "playing";
        this.handleStatKeys();
        break;
      case "trader":
        if (input.wasPressed("Escape") || input.wasPressed("KeyE")) this.screen = "playing";
        this.handleTraderKeys();
        break;
      case "dead":
        if (input.wasPressed("Enter") || input.wasPressed("Space")) this.respawn();
        break;
      case "victory":
        if (input.wasPressed("Enter") || input.wasPressed("Space")) this.screen = "playing";
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
    }

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
  }

  private restart(): void {
    this.seedName = randomSeedName();
    this.seed = hashSeed(this.seedName);
    this.rng = new Rng(this.seed ^ 0xabcdef);
    this.newWorld();
    this.screen = "title";
  }

  private updatePlaying(dt: number): void {
    const input = this.input;
    this.runTime += dt;
    this.enemyCtx.time = this.time;

    if (input.wasPressed("Escape") || input.wasPressed("KeyP")) {
      this.screen = "paused";
      return;
    }
    if (input.wasPressed("Tab") || input.wasPressed("KeyC")) {
      this.screen = "character";
      this.audio.play("ui");
      return;
    }

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateChests();
    this.updateSpawner(dt);
    this.particles.update(dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.camera.follow(this.player.x, this.player.y, dt);
    this.revealFog();

    if (this.bossDefeated && this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) this.screen = "victory";
    }
  }

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------

  private updatePlayer(dt: number): void {
    const p = this.player;
    const input = this.input;
    const world = this.world;

    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    p.novaCooldown = Math.max(0, p.novaCooldown - dt);
    p.boltCooldown = Math.max(0, p.boltCooldown - dt);

    // Aim at the mouse.
    const mouse = this.camera.screenToWorld(input.mouseX, input.mouseY);
    if (!p.isDodging) p.facing = angleTo(p.x, p.y, mouse.x, mouse.y);

    // Resource regen
    if (p.staminaDelay <= 0 && !p.isAttacking) p.stamina = Math.min(p.maxStamina, p.stamina + (24 + p.stats.agility * 1.5) * dt);
    p.glow = Math.min(p.maxGlow, p.glow + (1.2 + p.stats.attunement * 0.25) * dt);
    p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * dt);

    // Movement
    const axis = input.axis();
    const n = normalize(axis.x, axis.y);
    let speed = p.moveSpeed * world.speedAt(p.x, p.y);
    let mx = n.x;
    let my = n.y;
    if (p.isDodging) {
      p.dodgeTimer -= dt;
      const t = p.dodgeTimer / DODGE_TIME;
      speed = 520 * (0.35 + t * 0.65);
      mx = p.dodgeDirX;
      my = p.dodgeDirY;
      if (Math.random() < 0.5) this.particles.dust(p.x, p.y + 8, 1);
    } else if (p.isAttacking) {
      speed *= p.attackKind === "heavy" ? 0.3 : 0.55;
    }
    p.vx = mx * speed;
    p.vy = my * speed;
    const moved = world.moveCircle(p.x, p.y, p.r, p.vx * dt, p.vy * dt);
    p.x = moved.x;
    p.y = moved.y;

    // Hazards (glow sludge burns through armor)
    const hazard = world.hazardAt(p.x, p.y);
    if (hazard > 0 && !p.isDodging) {
      p.hp -= hazard * dt;
      if (Math.random() < 0.15) this.particles.burst(p.x, p.y + 6, 1, "#7fd63a", 40, 0.6, 3);
      if (p.hp <= 0) this.killPlayer();
    }

    // Actions
    if (!p.isAttacking && !p.isDodging) {
      const shift = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
      const heavy = input.mousePressed[2] || (input.mousePressed[0] && shift) || input.wasPressed("KeyK");
      const light = (input.mouseDown[0] && !shift) || input.isDown("KeyJ");
      if (heavy) this.startAttack("heavy");
      else if (light) this.startAttack("light");
    }
    if (input.wasPressed("Space") && !p.isDodging) this.startDodge();
    if (input.wasPressed("KeyQ")) this.castBolt();
    if (input.wasPressed("KeyR")) this.castNova();
    if (input.wasPressed("Digit1")) this.eatFood();
    if (input.wasPressed("Digit2")) this.useShard();

    // Attack progression
    if (p.isAttacking) {
      p.attackTimer -= dt;
      const progress = 1 - p.attackTimer / p.attackDuration;
      const hitAt = p.attackKind === "heavy" ? 0.45 : 0.3;
      if (p.attackHitPending && progress >= hitAt) {
        p.attackHitPending = false;
        this.resolveMeleeHit();
      }
      if (p.attackTimer <= 0) p.attackTimer = 0;
    }

    this.updateInteractions();
  }

  private startAttack(kind: "light" | "heavy"): void {
    const p = this.player;
    const w = p.weapon;
    const cost = kind === "heavy" ? w.stamina * 2 : w.stamina;
    if (p.stamina < cost) {
      if (this.input.mousePressed[0] || this.input.mousePressed[2]) {
        this.audio.play("denied");
        this.floatText(p.x, p.y - 20, "Exhausted", "#aaa", 12);
      }
      return;
    }
    p.stamina -= cost;
    p.staminaDelay = 0.7;
    p.attackKind = kind;
    p.attackDuration = kind === "heavy" ? w.cooldown * 1.8 : w.cooldown;
    p.attackTimer = p.attackDuration;
    p.attackHitPending = true;
    p.swingDir = -p.swingDir;
    this.audio.play(kind === "heavy" ? "heavy" : "swing");
  }

  private resolveMeleeHit(): void {
    const p = this.player;
    const w = p.weapon;
    const heavy = p.attackKind === "heavy";
    const range = w.range + (heavy ? 8 : 0);
    const arc = w.arc * (heavy ? 1.15 : 1);
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > range + e.r) continue;
      const a = angleTo(p.x, p.y, e.x, e.y);
      if (Math.abs(angleDiff(p.facing, a)) > arc / 2 + Math.atan2(e.r, Math.max(1, d))) continue;
      if (!this.world.hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
      const base = w.damage * p.damageMult * (heavy ? 1.9 : 1) * this.rng.range(0.9, 1.1);
      const kb = w.knockback * p.knockbackMult * (heavy ? 2 : 1);
      this.damageEnemy(e, base, a, kb, heavy);
      hits++;
    }
    if (hits > 0) {
      p.glow = Math.min(p.maxGlow, p.glow + 3 * hits);
      if (heavy) this.camera.shake(4, 0.2);
    }
  }

  private startDodge(): void {
    const p = this.player;
    if (p.stamina < DODGE_COST) {
      this.audio.play("denied");
      return;
    }
    const axis = this.input.axis();
    let n = normalize(axis.x, axis.y);
    if (n.x === 0 && n.y === 0) n = { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.stamina -= DODGE_COST;
    p.staminaDelay = 0.5;
    p.dodgeTimer = DODGE_TIME;
    p.dodgeDirX = n.x;
    p.dodgeDirY = n.y;
    p.attackTimer = 0;
    p.attackHitPending = false;
    this.particles.dust(p.x, p.y + 8, 8);
    this.audio.play("dodge");
  }

  private castBolt(): void {
    const p = this.player;
    if (p.boltCooldown > 0) return;
    if (p.glow < BOLT_COST) {
      this.audio.play("denied");
      this.floatText(p.x, p.y - 20, "Not enough glow", "#8ad3f5", 12);
      return;
    }
    p.glow -= BOLT_COST;
    p.boltCooldown = 0.45;
    const a = p.facing;
    this.projectiles.push({
      kind: "ember",
      faction: "player",
      x: p.x + Math.cos(a) * 16,
      y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * 520,
      vy: Math.sin(a) * 520,
      r: 6,
      damage: p.spellDamage,
      life: 1.4,
      aoe: 46,
      knockback: 160,
      dead: false,
    });
    this.particles.burst(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, 6, "#ffb347", 120, 0.3, 2, a, 0.8);
    this.audio.play("spell");
  }

  private castNova(): void {
    const p = this.player;
    if (p.novaCooldown > 0) return;
    if (p.glow < NOVA_COST) {
      this.audio.play("denied");
      this.floatText(p.x, p.y - 20, "Not enough glow", "#8ad3f5", 12);
      return;
    }
    p.glow -= NOVA_COST;
    p.novaCooldown = 3;
    const radius = 130;
    this.particles.ring(p.x, p.y, radius, "rgba(150,230,255,0.9)", 0.5);
    this.particles.burst(p.x, p.y, 40, "#9fe7ff", 260, 0.5, 3);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > radius + e.r) continue;
      const a = angleTo(p.x, p.y, e.x, e.y);
      this.damageEnemy(e, p.spellDamage * 1.4 * this.rng.range(0.9, 1.1), a, 420, true);
      e.stun = Math.max(e.stun, e.def.behavior === "boss" ? 0.3 : 0.9);
    }
    this.camera.shake(6, 0.3);
    this.audio.play("spell");
  }

  private eatFood(): void {
    const p = this.player;
    if (p.food <= 0) {
      this.audio.play("denied");
      this.toast("No canned food left.");
      return;
    }
    if (p.hp >= p.maxHp - 1) {
      this.toast("You're not hungry.");
      return;
    }
    p.food--;
    const heal = Math.round(p.maxHp * 0.4);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.floatText(p.x, p.y - 24, `+${heal}`, "#7fc36e", 16);
    this.audio.play("eat");
  }

  private useShard(): void {
    const p = this.player;
    if (p.shards <= 0) {
      this.audio.play("denied");
      this.toast("No glow shards left.");
      return;
    }
    p.shards--;
    p.glow = p.maxGlow;
    p.stamina = p.maxStamina;
    this.floatText(p.x, p.y - 24, "Glow restored", "#8ad3f5", 14);
    this.particles.burst(p.x, p.y, 20, "#9fe7ff", 120, 0.6, 3);
    this.audio.play("pickup");
  }

  private updateInteractions(): void {
    const p = this.player;
    const input = this.input;
    this.prompt = null;
    this.nearbyItem = null;

    // Nearest item pickup to inspect.
    let best: Pickup | null = null;
    let bestD = 48;
    for (const pk of this.pickups) {
      if (pk.kind !== "item" || pk.grace > 0) continue;
      const d = dist(p.x, p.y, pk.x, pk.y);
      if (d < bestD) {
        bestD = d;
        best = pk;
      }
    }
    if (best) {
      this.nearbyItem = best;
      const item = best.item!;
      const current = item.kind === "weapon" ? p.weapon : p.armor;
      const delta = itemScore(item) - itemScore(current);
      const verdict = delta > 0.5 ? "upgrade" : delta < -0.5 ? "downgrade" : "sidegrade";
      this.prompt = `[E] Take ${itemName(item)} (${verdict})   [F] Salvage for ${salvageValue(item)} scrap`;
      if (input.wasPressed("KeyE")) {
        this.equip(item);
        best.dead = true;
        return;
      }
      if (input.wasPressed("KeyF")) {
        const v = salvageValue(item);
        p.scrap += v;
        best.dead = true;
        this.floatText(p.x, p.y - 24, `+${v} scrap`, "#e8c070", 14);
        this.audio.play("scrap");
        return;
      }
    }

    if (dist(p.x, p.y, this.campfire.x, this.campfire.y) < 70) {
      this.prompt = "[E] Rest at the Hearth — restore health, stamina and glow";
      if (input.wasPressed("KeyE")) this.rest();
    } else if (dist(p.x, p.y, this.trader.x, this.trader.y) < 70) {
      this.prompt = "[E] Talk to Marrow the trader";
      if (input.wasPressed("KeyE")) {
        this.screen = "trader";
        this.audio.play("ui");
      }
    }
  }

  private equip(item: Item): void {
    const p = this.player;
    const old: Item = item.kind === "weapon" ? p.weapon : p.armor;
    if (item.kind === "weapon") p.weapon = item;
    else p.armor = item;
    // Drop the old gear at your feet unless it is the starting rags.
    if (!(old.kind === "armor" && old.base.id === "rags")) {
      this.pickups.push({ kind: "item", x: p.x + 20, y: p.y + 10, vx: 40, vy: 30, amount: 0, item: old, life: 600, grace: 1.2, dead: false });
    }
    this.toast(`Equipped ${itemName(item)}`, "#7fc36e");
    this.audio.play("pickup");
  }

  private rest(): void {
    const p = this.player;
    p.restore();
    this.particles.burst(p.x, p.y, 24, "#ffb347", 90, 0.9, 3);
    this.toast("You rest by the fire. The ash settles.", "#ffd27a");
    this.audio.play("rest");
    // Resting stirs the wastes: re-populate cleared camps slightly so the world stays hostile.
    for (let i = 0; i < this.camps.length; i++) {
      if (this.campCleared[i] && this.rng.chance(0.4)) {
        this.campCleared[i] = false;
        this.populateCamp(this.camps[i], i);
      }
    }
  }

  /** Returns true if damage was applied (false if dodged / invulnerable). */
  damagePlayer(amount: number, fromX: number, fromY: number, knockback: number): boolean {
    const p = this.player;
    if (p.dead || p.isInvulnerable) return false;
    const reduced = Math.max(1, Math.round(amount - p.armor.defense));
    p.hp -= reduced;
    p.hitFlash = 0.12;
    p.invulnTimer = 0.4;
    const a = angleTo(fromX, fromY, p.x, p.y);
    const kb = knockback / (1 + p.armor.defense * 0.05);
    const moved = this.world.moveCircle(p.x, p.y, p.r, Math.cos(a) * kb * 0.08, Math.sin(a) * kb * 0.08);
    p.x = moved.x;
    p.y = moved.y;
    p.attackTimer = Math.min(p.attackTimer, 0.1);
    this.particles.blood(p.x, p.y, a, 8, "#a8302a");
    this.floatText(p.x, p.y - 22, `-${reduced}`, "#ff6a5a", 15);
    this.camera.shake(Math.min(10, 3 + reduced * 0.2), 0.25);
    this.audio.play("hurt");
    if (p.hp <= 0) this.killPlayer();
    return true;
  }

  private killPlayer(): void {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.deaths++;
    this.particles.blood(p.x, p.y, 0, 30, "#a8302a");
    this.audio.play("die");
    this.camera.shake(12, 0.6);
    this.screen = "dead";
  }

  private respawn(): void {
    const p = this.player;
    const lost = Math.floor(p.scrap * 0.35);
    p.scrap -= lost;
    const spawn = this.world.findOpenNear(Math.floor(this.hearth.x / TILE) + 2, Math.floor(this.hearth.y / TILE) + 1, p.r);
    p.x = spawn.x;
    p.y = spawn.y;
    p.restore();
    this.camera.snapTo(p.x, p.y);
    this.projectiles.length = 0;
    for (const e of this.enemies) {
      if (!e.dead && e.def.behavior !== "boss") e.state = "return";
    }
    this.screen = "playing";
    this.toast(lost > 0 ? `You wake at the Hearth. ${lost} scrap lost to the ash.` : "You wake at the Hearth.", "#ffd27a");
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------

  private updateEnemies(dt: number): void {
    const p = this.player;
    // Only simulate enemies within a generous radius; the rest sleep.
    const simRange = 1400;
    for (const e of this.enemies) {
      if (!e.dead && Math.abs(e.x - p.x) > simRange && Math.abs(e.y - p.y) > simRange) continue;
      updateEnemy(e, dt, this.enemyCtx);
    }
    // Separation so packs don't overlap into a single blob.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const wa = b.def.mass / (a.def.mass + b.def.mass);
        const wb = 1 - wa;
        if (!this.world.circleBlocked(a.x - nx * push * wa, a.y - ny * push * wa, a.r)) {
          a.x -= nx * push * wa;
          a.y -= ny * push * wa;
        }
        if (!this.world.circleBlocked(b.x + nx * push * wb, b.y + ny * push * wb, b.r)) {
          b.x += nx * push * wb;
          b.y += ny * push * wb;
        }
      }
      // Body-block the player (enemies are solid-ish).
      if (!p.isDodging) {
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const minD = a.r + p.r - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = minD - d;
          const nx = dx / d;
          const ny = dy / d;
          const moved = this.world.moveCircle(p.x, p.y, p.r, nx * push * 0.7, ny * push * 0.7);
          p.x = moved.x;
          p.y = moved.y;
        }
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead && this.enemies[i].deathTimer > 0.6) this.enemies.splice(i, 1);
    }
  }

  damageEnemy(e: Enemy, amount: number, angle: number, knockback: number, heavy: boolean): void {
    if (e.dead) return;
    const armored = e.def.armor > 0;
    const dmg = Math.max(1, Math.round(amount - e.def.armor));
    e.hp -= dmg;
    e.flash = 0.1;
    const kbScale = 1 / e.def.mass;
    e.kbx += Math.cos(angle) * knockback * kbScale;
    e.kby += Math.sin(angle) * knockback * kbScale;
    if (heavy && e.def.behavior !== "boss") e.stun = Math.max(e.stun, 0.25);
    if (e.state === "idle" || e.state === "return") e.state = "chase";
    if (e.def.behavior === "boss" && !e.awake) {
      e.awake = true;
      this.onBossEvent("wake");
    }
    const crit = dmg >= amount * 1.05;
    this.floatText(e.x + this.rng.range(-8, 8), e.y - e.r - 6, `${dmg}`, heavy ? "#ffb347" : "#fff", heavy ? 17 : 14, crit);
    if (armored) {
      this.particles.sparks(e.x, e.y, angle, 6);
      this.audio.play("hitArmor");
    } else {
      this.particles.blood(e.x, e.y, angle, 7, e.def.id === "husk" ? "#5fbf4a" : e.def.id === "spitter" ? "#8b5c9e" : "#8f1d1d");
      this.audio.play("hit");
    }
    this.camera.shake(heavy ? 3 : 1.5, 0.12);
    if (e.hp <= 0) this.killEnemy(e, angle);
  }

  private killEnemy(e: Enemy, angle: number): void {
    e.dead = true;
    e.deathTimer = 0;
    e.state = "dead";
    const p = this.player;
    p.kills++;
    const m = tierMult(e.tier);
    const xp = Math.round(e.def.xp * m.xp);
    const levels = p.gainXp(xp);
    this.floatText(e.x, e.y - e.r - 20, `+${xp} xp`, "#c9a0ff", 12);
    this.particles.blood(e.x, e.y, angle, 14, e.def.id === "husk" ? "#5fbf4a" : e.def.id === "rust" ? "#c98a4a" : "#8f1d1d");
    this.audio.play("die");
    if (levels > 0) {
      this.toast(`Level ${p.level}! +${levels} stat point${levels > 1 ? "s" : ""} (Tab)`, "#c9a0ff");
      this.particles.ring(p.x, p.y, 60, "rgba(201,160,255,0.9)", 0.6);
      this.audio.play("levelup");
    }

    // Loot
    const scrapAmt = this.rng.int(e.def.scrap[0], e.def.scrap[1]);
    const piles = Math.min(6, Math.ceil(scrapAmt / 3));
    for (let i = 0; i < piles; i++) this.dropPickup("scrap", e.x, e.y, Math.ceil(scrapAmt / piles));
    if (this.rng.chance(0.12)) this.dropPickup("food", e.x, e.y, 1);
    if (this.rng.chance(0.06)) this.dropPickup("shard", e.x, e.y, 1);
    const itemChance = e.def.behavior === "boss" ? 1 : 0.06 + e.tier * 0.02;
    if (this.rng.chance(itemChance)) {
      const luck = e.def.behavior === "boss" ? 3 : 0;
      const item = this.rng.chance(0.65) ? rollWeapon(this.rng, e.tier, luck) : rollArmor(this.rng, e.tier, luck);
      this.dropPickup("item", e.x, e.y, 0, item);
    }

    if (e.campIndex >= 0) {
      this.campAlive[e.campIndex]--;
      if (this.campAlive[e.campIndex] <= 0 && !this.campCleared[e.campIndex]) {
        this.campCleared[e.campIndex] = true;
        p.campsCleared++;
        this.toast("Camp cleared. The wastes grow quieter here.", "#7fc36e");
        this.dropPickup("food", e.x, e.y, 1);
        this.dropPickup("shard", e.x, e.y, 1);
      }
    }

    if (e.def.behavior === "boss") {
      this.bossDefeated = true;
      this.victoryTimer = 2.2;
      this.camera.shake(16, 1.0);
      this.particles.ring(e.x, e.y, 200, "rgba(255,150,60,0.9)", 1.2);
      this.particles.burst(e.x, e.y, 120, "#9fe7ff", 320, 1.2, 4);
      this.dropPickup("item", e.x, e.y, 0, this.rng.chance(0.5) ? rollWeapon(this.rng, 4, 4) : rollArmor(this.rng, 4, 4));
      this.dropPickup("shard", e.x, e.y, 1);
      this.dropPickup("shard", e.x, e.y, 1);
      this.audio.play("bossRoar");
    }
  }

  private dropPickup(kind: Pickup["kind"], x: number, y: number, amount: number, item?: Item): void {
    const a = this.rng.range(0, Math.PI * 2);
    const s = this.rng.range(40, 140);
    this.pickups.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, amount, item, life: 240, grace: 0.5, dead: false });
  }

  private onBossEvent(kind: "wake" | "phase" | "slam" | "charge"): void {
    switch (kind) {
      case "wake":
        this.toast("THE ASH WARDEN STIRS", "#ff8a5a");
        this.audio.play("bossRoar");
        this.camera.shake(10, 0.8);
        break;
      case "phase":
        this.toast("The Warden's crystals flare brighter.", "#9fe7ff");
        this.audio.play("bossRoar");
        this.camera.shake(8, 0.5);
        break;
      case "slam":
        this.camera.shake(12, 0.4);
        this.audio.play("heavy");
        break;
      case "charge":
        this.audio.play("dodge");
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Projectiles, pickups, chests, spawner
  // -------------------------------------------------------------------------

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.kind === "ember" && Math.random() < 0.7) this.particles.burst(pr.x, pr.y, 1, "#ff9a3a", 20, 0.3, 3);
      if (pr.life <= 0 || this.world.isSolidAt(pr.x, pr.y)) {
        this.explode(pr);
        continue;
      }
      if (pr.faction === "player") {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist(pr.x, pr.y, e.x, e.y) < pr.r + e.r) {
            if (pr.aoe > 0) {
              this.explode(pr);
            } else {
              this.damageEnemy(e, pr.damage, Math.atan2(pr.vy, pr.vx), pr.knockback, false);
              pr.dead = true;
            }
            break;
          }
        }
      } else if (!p.dead && dist(pr.x, pr.y, p.x, p.y) < pr.r + p.r) {
        this.damagePlayer(pr.damage, pr.x - pr.vx * 0.1, pr.y - pr.vy * 0.1, pr.knockback);
        this.particles.burst(pr.x, pr.y, 8, pr.kind === "acid" ? "#7fd63a" : "#9fe7ff", 120, 0.4, 3);
        pr.dead = true;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
  }

  private explode(pr: Projectile): void {
    pr.dead = true;
    if (pr.kind === "ember") {
      this.particles.burst(pr.x, pr.y, 22, "#ffb347", 200, 0.45, 3);
      this.particles.ring(pr.x, pr.y, pr.aoe, "rgba(255,170,80,0.8)", 0.3);
      if (pr.aoe > 0) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist(pr.x, pr.y, e.x, e.y) < pr.aoe + e.r) this.damageEnemy(e, pr.damage, angleTo(pr.x, pr.y, e.x, e.y), pr.knockback, false);
        }
      }
      this.camera.shake(2, 0.15);
    } else {
      this.particles.burst(pr.x, pr.y, 6, pr.kind === "acid" ? "#7fd63a" : "#9fe7ff", 80, 0.35, 3);
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.life -= dt;
      pk.grace -= dt;
      if (pk.life <= 0) {
        pk.dead = true;
        continue;
      }
      const drag = Math.max(0, 1 - 5 * dt);
      pk.vx *= drag;
      pk.vy *= drag;
      const moved = this.world.moveCircle(pk.x, pk.y, 6, pk.vx * dt, pk.vy * dt);
      pk.x = moved.x;
      pk.y = moved.y;
      if (pk.kind === "item" || pk.grace > 0 || p.dead) continue;
      const d = dist(pk.x, pk.y, p.x, p.y);
      if (d < 90) {
        const n = normalize(p.x - pk.x, p.y - pk.y);
        pk.vx += n.x * 900 * dt;
        pk.vy += n.y * 900 * dt;
      }
      if (d < p.r + 8) {
        pk.dead = true;
        switch (pk.kind) {
          case "scrap":
            p.scrap += pk.amount;
            this.audio.play("scrap");
            break;
          case "food":
            p.food += pk.amount;
            this.floatText(p.x, p.y - 24, "+ Canned food", "#c8442a", 12);
            this.audio.play("pickup");
            break;
          case "shard":
            p.shards += pk.amount;
            this.floatText(p.x, p.y - 24, "+ Glow shard", "#8ad3f5", 12);
            this.audio.play("pickup");
            break;
        }
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].dead) this.pickups.splice(i, 1);
  }

  private updateChests(): void {
    const p = this.player;
    for (const c of this.chests) {
      if (c.opened) continue;
      if (dist(p.x, p.y, c.x, c.y) < p.r + 20) {
        c.opened = true;
        const scrapAmt = this.rng.int(6, 14) * c.tier;
        for (let i = 0; i < 4; i++) this.dropPickup("scrap", c.x, c.y, Math.ceil(scrapAmt / 4));
        if (this.rng.chance(0.6)) this.dropPickup("food", c.x, c.y, 1);
        if (this.rng.chance(0.35)) this.dropPickup("shard", c.x, c.y, 1);
        if (this.rng.chance(0.55)) {
          const item = this.rng.chance(0.6) ? rollWeapon(this.rng, c.tier, 1) : rollArmor(this.rng, c.tier, 1);
          this.dropPickup("item", c.x, c.y, 0, item);
        }
        this.particles.burst(c.x, c.y, 20, "#ffd27a", 120, 0.6, 3);
        this.audio.play("pickup");
        this.toast("You pry open a stash.");
      }
    }
  }

  /** Roaming packs keep the wastes dangerous between camps. */
  private updateSpawner(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.rng.range(16, 28);
    const p = this.player;
    if (p.dead) return;
    if (dist(p.x, p.y, this.hearth.x, this.hearth.y) < 420) return;
    if (this.enemies.length >= MAX_ENEMIES) return;
    let nearby = 0;
    for (const e of this.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < 700) nearby++;
    if (nearby >= 6) return;
    const progress = clamp((p.x - this.hearth.x) / (this.world.map.bossDen.x * TILE - this.hearth.x), 0, 1);
    const tier = 1 + Math.min(3, Math.floor(progress * 3.2));
    const packKinds: EnemyId[] = tier >= 3 ? ["husk", "rust", "spitter", "hound"] : tier === 2 ? ["scav", "hound", "husk", "spitter"] : ["scav", "hound"];
    const count = this.rng.int(2, 3);
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(560, 720);
    const cx = p.x + Math.cos(a) * d;
    const cy = p.y + Math.sin(a) * d;
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    if (tx < 4 || ty < 4 || tx >= this.world.map.w - 4 || ty >= this.world.map.h - 4) return;
    if (this.world.isSolidAt(cx, cy)) return;
    const id = this.rng.pick(packKinds);
    for (let i = 0; i < count; i++) {
      const pos = this.world.findOpenNear(tx + this.rng.int(-2, 2), ty + this.rng.int(-2, 2), 16);
      const e = this.spawnEnemy(id, pos.x, pos.y, tier);
      e.state = "chase";
    }
  }

  // -------------------------------------------------------------------------
  // Character & trader
  // -------------------------------------------------------------------------

  private handleStatKeys(): void {
    const keys: [string, StatName][] = [["Digit1", "vigor"], ["Digit2", "might"], ["Digit3", "agility"], ["Digit4", "attunement"]];
    for (const [code, stat] of keys) {
      if (this.input.wasPressed(code)) {
        if (this.player.spend(stat)) this.audio.play("ui");
        else this.audio.play("denied");
      }
    }
  }

  traderOffers(): TraderOffer[] {
    const p = this.player;
    const progress = clamp(p.campsCleared / Math.max(1, this.camps.length), 0, 1);
    const crateTier = 1 + Math.min(3, Math.floor(progress * 3.5));
    const weaponCost = temperCost(p.weapon);
    const armorCost = temperCost(p.armor);
    const isRags = p.armor.base.id === "rags";
    return [
      { label: "Canned food (heals 40%)", cost: 15, available: true, apply: () => { p.food++; } },
      { label: "Glow shard (restores glow & stamina)", cost: 22, available: true, apply: () => { p.shards++; } },
      { label: `Temper ${itemName(p.weapon)} (+10% damage)`, cost: weaponCost, available: true, apply: () => temperItem(p.weapon) },
      isRags
        ? { label: "Scrap Plating armor (+2 defense)", cost: 40, available: true, apply: () => { p.armor = makeArmor(ARMOR_BASES[1], "scrap"); } }
        : { label: `Reinforce ${itemName(p.armor)} (+1 defense)`, cost: armorCost, available: true, apply: () => temperItem(p.armor) },
      { label: `Weapon crate (random tier ${crateTier} weapon)`, cost: 55 + crateTier * 15, available: true, apply: () => { this.dropPickup("item", p.x, p.y + 30, 0, rollWeapon(this.rng, crateTier, 1)); } },
      { label: `Armor crate (random tier ${crateTier} armor)`, cost: 55 + crateTier * 15, available: true, apply: () => { this.dropPickup("item", p.x, p.y + 30, 0, rollArmor(this.rng, crateTier, 1)); } },
    ];
  }

  private handleTraderKeys(): void {
    const offers = this.traderOffers();
    for (let i = 0; i < offers.length; i++) {
      if (!this.input.wasPressed(`Digit${i + 1}`)) continue;
      const o = offers[i];
      if (!o.available) continue;
      if (this.player.scrap < o.cost) {
        this.audio.play("denied");
        this.toast("Not enough scrap.", "#ff8a7a");
        continue;
      }
      this.player.scrap -= o.cost;
      o.apply();
      this.audio.play("pickup");
      this.toast(`Bought: ${o.label.split(" (")[0]}`, "#7fc36e");
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  toast(text: string, color = "#e8e0d0"): void {
    this.toasts.push({ text, life: 4, color });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  floatText(x: number, y: number, text: string, color: string, size = 14, bold = false): void {
    this.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9, vy: -40, size: bold ? size + 3 : size });
  }

  /** Ambient darkness follows a slow day/night cycle. */
  get ambientDarkness(): number {
    const cycle = (Math.sin(this.runTime / 70) + 1) / 2;
    return 0.42 + cycle * 0.3;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0908";
    ctx.fillRect(0, 0, W, H);

    cam.apply(ctx);
    this.tiles.draw(ctx, cam);

    // Static features
    if (this.inView(this.campfire.x, this.campfire.y, 60)) drawCampfire(ctx, this.campfire.x, this.campfire.y, this.time);
    if (this.inView(this.trader.x, this.trader.y, 60)) drawTrader(ctx, this.trader.x, this.trader.y, this.time);
    for (const c of this.chests) if (this.inView(c.x, c.y, 30)) drawChest(ctx, c, this.time);
    for (const pk of this.pickups) if (this.inView(pk.x, pk.y, 20)) drawPickup(ctx, pk, this.time);

    // Depth-sort dynamic entities by y.
    const drawables: { y: number; draw: () => void }[] = [];
    for (const e of this.enemies) if (this.inView(e.x, e.y, 80)) drawables.push({ y: e.y, draw: () => drawEnemy(ctx, e, this.time) });
    if (!this.player.dead) drawables.push({ y: this.player.y, draw: () => drawPlayer(ctx, this.player, this.time) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    for (const pr of this.projectiles) drawProjectile(ctx, pr, this.time);
    this.particles.draw(ctx);

    // Floating combat text
    ctx.textAlign = "center";
    for (const t of this.texts) {
      const a = Math.min(1, t.life / 0.3);
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px "Courier New", monospace`;
      ctx.fillStyle = "#000";
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.renderLighting();
    drawHud(ctx, this);
    drawScreens(ctx, this);
  }

  private inView(x: number, y: number, pad: number): boolean {
    const c = this.camera;
    return x + pad > c.left && x - pad < c.right && y + pad > c.top && y - pad < c.bottom;
  }

  private renderLighting(): void {
    const lc = this.lightCtx;
    const W = this.lightCanvas.width;
    const H = this.lightCanvas.height;
    const cam = this.camera;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, W, H);
    lc.fillStyle = `rgba(6,4,10,${this.ambientDarkness})`;
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = "destination-out";

    const light = (wx: number, wy: number, r: number, strength: number) => {
      const s = cam.worldToScreen(wx, wy);
      if (s.x < -r || s.y < -r || s.x > W + r || s.y > H + r) return;
      const g = lc.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * cam.zoom);
      g.addColorStop(0, `rgba(255,255,255,${strength})`);
      g.addColorStop(0.5, `rgba(255,255,255,${strength * 0.5})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      lc.fillStyle = g;
      lc.fillRect(s.x - r * cam.zoom, s.y - r * cam.zoom, r * 2 * cam.zoom, r * 2 * cam.zoom);
    };

    if (!this.player.dead) light(this.player.x, this.player.y, 330, 1);
    const flicker = 1 + Math.sin(this.time * 11) * 0.06;
    light(this.campfire.x, this.campfire.y, 260 * flicker, 1);
    light(this.trader.x, this.trader.y, 90, 0.7);
    for (const pr of this.projectiles) light(pr.x, pr.y, pr.kind === "acid" ? 40 : 80, 0.9);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.def.id === "husk") light(e.x, e.y, 50, 0.5);
      if (e.def.id === "warden") light(e.x, e.y, 200, 0.9);
      if (e.def.id === "rust") light(e.x, e.y - 10, 30, 0.6);
    }
    for (const c of this.chests) if (!c.opened && this.inView(c.x, c.y, 60)) light(c.x, c.y, 60, 0.6);
    for (const pk of this.pickups) if (pk.kind === "item" || pk.kind === "shard") light(pk.x, pk.y, 40, 0.6);
    // Crystal fields glow in the dark.
    const crystals = this.world.map.crystals;
    const pulse = 0.7 + Math.sin(this.time * 2) * 0.15;
    for (const c of crystals) {
      const wx = c.x * TILE + TILE / 2;
      const wy = c.y * TILE + TILE / 2;
      if (this.inView(wx, wy, 120)) light(wx, wy, 110 * pulse, 0.8);
    }
    // Toxic pools emit a faint glow; sample the visible tiles.
    const minTx = Math.max(0, Math.floor(cam.left / TILE));
    const maxTx = Math.min(this.world.map.w - 1, Math.floor(cam.right / TILE));
    const minTy = Math.max(0, Math.floor(cam.top / TILE));
    const maxTy = Math.min(this.world.map.h - 1, Math.floor(cam.bottom / TILE));
    for (let ty = minTy; ty <= maxTy; ty += 2) {
      for (let tx = minTx; tx <= maxTx; tx += 2) {
        if (this.world.tileAt(tx, ty) === Tile.Toxic) light(tx * TILE + TILE, ty * TILE + TILE, 70, 0.35);
      }
    }

    lc.globalCompositeOperation = "source-over";
    // Colour tint for the sludge and crystals, drawn as additive haze.
    this.ctx.drawImage(this.lightCanvas, 0, 0);

    // Vignette
    const vg = this.ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    this.ctx.fillStyle = vg;
    this.ctx.fillRect(0, 0, W, H);
  }
}

function salvageValue(item: Item): number {
  const base = item.kind === "weapon" ? 6 + item.base.minTier * 4 : 5 + item.base.minTier * 4;
  const mult = item.rarity === "relic" ? 4 : item.rarity === "tempered" ? 2.5 : item.rarity === "worn" ? 1.5 : 1;
  return Math.round(base * mult + item.tempers * 8);
}

const SEED_WORDS_A = ["ash", "rust", "bone", "glow", "ember", "dust", "hollow", "cinder", "salt", "iron"];
const SEED_WORDS_B = ["fall", "reach", "gate", "mire", "waste", "run", "march", "field", "hold", "wake"];

export function randomSeedName(): string {
  const a = SEED_WORDS_A[Math.floor(Math.random() * SEED_WORDS_A.length)];
  const b = SEED_WORDS_B[Math.floor(Math.random() * SEED_WORDS_B.length)];
  return `${a}${b}-${Math.floor(Math.random() * 900 + 100)}`;
}
