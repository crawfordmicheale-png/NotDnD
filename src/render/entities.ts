import { easeOutCubic } from "../core/math";
import { Enemy } from "../entities/enemies";
import { Player } from "../entities/player";
import { Chest, Pickup, Projectile } from "../entities/types";
import { RARITY, Weapon } from "../items/items";

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Current swing offset (radians) for the weapon given attack progress. */
export function swingOffset(p: Player): number {
  if (!p.isAttacking) return 0.55 * p.swingDir;
  const progress = 1 - p.attackTimer / p.attackDuration;
  const arc = p.weapon.arc * (p.attackKind === "heavy" ? 1.15 : 1);
  const windup = p.attackKind === "heavy" ? 0.42 : 0.28;
  if (progress < windup) {
    // Pull back
    const t = progress / windup;
    return p.swingDir * (0.55 + t * (arc / 2 - 0.55 + 0.4));
  }
  const t = Math.min(1, (progress - windup) / 0.35);
  return p.swingDir * (arc / 2 + 0.4) - p.swingDir * easeOutCubic(t) * (arc + 0.4);
}

export function drawWeapon(ctx: CanvasRenderingContext2D, w: Weapon, length: number): void {
  // Drawn along +X from the hand.
  const col = RARITY[w.rarity].color;
  ctx.lineCap = "round";
  switch (w.base.id) {
    case "pipe":
      ctx.strokeStyle = "#7a5a3a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(length * 0.6, -3);
      ctx.lineTo(length * 0.6, 3);
      ctx.stroke();
      break;
    case "machete":
      ctx.strokeStyle = "#3b2a1c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.3, 0);
      ctx.stroke();
      ctx.fillStyle = "#b8bcc0";
      ctx.beginPath();
      ctx.moveTo(length * 0.3, -2);
      ctx.lineTo(length * 0.95, -5);
      ctx.lineTo(length, 0);
      ctx.lineTo(length * 0.3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "spear":
      ctx.strokeStyle = "#6b5030";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-length * 0.25, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
      ctx.fillStyle = "#a8a29a";
      ctx.beginPath();
      ctx.moveTo(length * 0.82, -4);
      ctx.lineTo(length, 0);
      ctx.lineTo(length * 0.82, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "chainblade":
      ctx.strokeStyle = "#3b2a1c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.25, 0);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const x = length * 0.25 + (length * 0.75 * i) / 6;
        ctx.lineTo(x, i % 2 === 0 ? -3 : 3);
      }
      ctx.stroke();
      break;
    case "axe":
      ctx.strokeStyle = "#7a2a1a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
      ctx.fillStyle = "#c9c9c9";
      ctx.beginPath();
      ctx.moveTo(length * 0.65, -3);
      ctx.lineTo(length * 0.8, -12);
      ctx.lineTo(length * 1.05, -6);
      ctx.lineTo(length * 1.05, 6);
      ctx.lineTo(length * 0.8, 12);
      ctx.lineTo(length * 0.65, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "sledge":
      ctx.strokeStyle = "#5c4a3a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
      ctx.fillStyle = "#6a6a70";
      ctx.fillRect(length * 0.75, -9, length * 0.3, 18);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(length * 0.75, -9, length * 0.3, 18);
      break;
    case "glaive":
      ctx.strokeStyle = "#2c2c34";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-length * 0.3, 0);
      ctx.lineTo(length * 0.7, 0);
      ctx.stroke();
      ctx.fillStyle = "#9fe7ff";
      ctx.beginPath();
      ctx.moveTo(length * 0.65, -3);
      ctx.quadraticCurveTo(length * 0.95, -14, length * 1.05, 0);
      ctx.lineTo(length * 0.65, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
  }
}

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, time: number): void {
  const bob = Math.sin(time * 10) * (Math.hypot(p.vx, p.vy) > 10 ? 1.5 : 0.4);
  shadow(ctx, p.x, p.y + 10, 12, 5);

  ctx.save();
  ctx.translate(p.x, p.y + bob);
  if (p.isDodging) {
    const t = 1 - p.dodgeTimer / 0.32;
    ctx.rotate(t * Math.PI * 2 * (p.dodgeDirX >= 0 ? 1 : -1));
  }

  // Cloak
  ctx.fillStyle = p.hitFlash > 0 ? "#ffffff" : "#5a3d2c";
  ctx.beginPath();
  ctx.moveTo(-11, -4);
  ctx.quadraticCurveTo(-13, 12, -4, 13);
  ctx.lineTo(4, 13);
  ctx.quadraticCurveTo(13, 12, 11, -4);
  ctx.closePath();
  ctx.fill();
  // Chest strap / armor hint
  ctx.fillStyle = p.hitFlash > 0 ? "#ffffff" : p.armor.defense > 0 ? "#8a8a8a" : "#3b2a1c";
  ctx.fillRect(-7, -2, 14, 5);
  // Hood
  ctx.fillStyle = p.hitFlash > 0 ? "#ffffff" : "#6e4b34";
  ctx.beginPath();
  ctx.arc(0, -5, 8, 0, Math.PI * 2);
  ctx.fill();
  // Face shadow and eyes toward facing
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing);
  ctx.fillStyle = "#1a120c";
  ctx.beginPath();
  ctx.arc(fx * 2.5, -5 + fy * 2.5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd98a";
  ctx.fillRect(fx * 3 - 2.5 - fy * 2, -6 + fy * 3 + fx * 2 - 1, 2, 2);
  ctx.fillRect(fx * 3 + 0.5 + fy * 2, -6 + fy * 3 - fx * 2 - 1, 2, 2);
  ctx.restore();

  // Weapon in hand
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(p.facing + swingOffset(p));
  ctx.translate(6, 0);
  drawWeapon(ctx, p.weapon, p.weapon.range * 0.72);
  ctx.restore();

  // Swing trail
  if (p.isAttacking) {
    const progress = 1 - p.attackTimer / p.attackDuration;
    const windup = p.attackKind === "heavy" ? 0.42 : 0.28;
    if (progress > windup && progress < windup + 0.4) {
      const t = (progress - windup) / 0.4;
      const arc = p.weapon.arc * (p.attackKind === "heavy" ? 1.15 : 1);
      ctx.strokeStyle = p.attackKind === "heavy" ? `rgba(255,170,80,${0.6 * (1 - t)})` : `rgba(255,255,255,${0.45 * (1 - t)})`;
      ctx.lineWidth = p.attackKind === "heavy" ? 7 : 4;
      ctx.beginPath();
      const end = p.facing + swingOffset(p);
      const start = p.facing + p.swingDir * (arc / 2 + 0.4);
      ctx.arc(p.x, p.y, p.weapon.range * 0.75, Math.min(start, end), Math.max(start, end));
      ctx.stroke();
    }
  }
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const d = e.def;
  const alpha = e.dead ? Math.max(0, 1 - e.deathTimer / 0.6) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const squash = e.dead ? 1 - Math.min(1, e.deathTimer / 0.6) * 0.5 : 1;
  const bob = e.state === "chase" ? Math.sin(time * 12 + e.seed * 10) * 1.5 : 0;
  shadow(ctx, e.x, e.y + e.r * 0.8, e.r, e.r * 0.4);
  ctx.translate(e.x, e.y + bob);
  ctx.scale(1, squash);
  const flash = e.flash > 0;
  const col = flash ? "#ffffff" : d.color;
  const windupT = e.state === "windup" ? 1 - e.timer / d.windup : 0;

  switch (d.id) {
    case "scav": {
      ctx.fillStyle = flash ? "#fff" : "#4a3a2c";
      ctx.beginPath();
      ctx.ellipse(0, 2, 11, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, -6, 7, 0, Math.PI * 2);
      ctx.fill();
      // Rag mask
      ctx.fillStyle = flash ? "#fff" : "#8a2a2a";
      ctx.fillRect(-6, -8, 12, 3);
      // Weapon: crude blade
      ctx.save();
      ctx.rotate(e.facing + (windupT > 0 ? -1.2 * windupT : 0.4));
      ctx.strokeStyle = "#9a9a9a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "hound": {
      ctx.save();
      ctx.rotate(e.facing);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(14, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.strokeStyle = flash ? "#fff" : "#4a3a30";
      ctx.lineWidth = 3;
      const leg = Math.sin(time * 18 + e.seed * 6) * 4;
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-10 + leg, 12);
      ctx.moveTo(8, 6);
      ctx.lineTo(10 - leg, 12);
      ctx.moveTo(-8, -6);
      ctx.lineTo(-10 - leg, -12);
      ctx.moveTo(8, -6);
      ctx.lineTo(10 + leg, -12);
      ctx.stroke();
      // Glowing eyes
      ctx.fillStyle = "#ff4a3a";
      ctx.fillRect(16, -3, 2, 2);
      ctx.fillRect(16, 1, 2, 2);
      // Bone spines
      ctx.fillStyle = flash ? "#fff" : "#d8cbb2";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5 - 2, -4);
        ctx.lineTo(i * 5, -10);
        ctx.lineTo(i * 5 + 2, -4);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "husk": {
      ctx.fillStyle = flash ? "#fff" : "#4e6142";
      ctx.beginPath();
      ctx.ellipse(0, 3, 14, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(Math.cos(e.facing) * 3, -7 + Math.sin(e.facing) * 2, 8, 0, Math.PI * 2);
      ctx.fill();
      // Glow veins
      ctx.strokeStyle = flash ? "#fff" : `rgba(140,255,120,${0.6 + Math.sin(time * 4 + e.seed * 9) * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-2, 8);
      ctx.lineTo(3, 2);
      ctx.lineTo(7, 10);
      ctx.stroke();
      // Arms swinging in windup
      ctx.save();
      ctx.rotate(e.facing);
      ctx.strokeStyle = flash ? "#fff" : "#5c7350";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, -8);
      ctx.lineTo(16 + windupT * 6, -6 - windupT * 8);
      ctx.moveTo(4, 8);
      ctx.lineTo(16 + windupT * 6, 6 + windupT * 8);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "spitter": {
      const pulse = 1 + Math.sin(time * 6 + e.seed * 5) * 0.06 + windupT * 0.2;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 2, 14 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#c8f06a";
      for (let i = 0; i < 4; i++) {
        const a = e.seed * 7 + i * 1.7;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 7, 2 + Math.sin(a) * 6, 2.5 + windupT * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.rotate(e.facing);
      ctx.fillStyle = flash ? "#fff" : "#5e3a6e";
      ctx.beginPath();
      ctx.moveTo(8, -6);
      ctx.lineTo(20, 0);
      ctx.lineTo(8, 6);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "rust": {
      ctx.fillStyle = flash ? "#fff" : "#5a4438";
      ctx.fillRect(-13, -12, 26, 28);
      ctx.fillStyle = col;
      ctx.fillRect(-11, -10, 22, 24);
      ctx.fillStyle = flash ? "#fff" : "#3b2e26";
      ctx.fillRect(-9, -14, 18, 10);
      ctx.fillStyle = `rgba(255,120,40,${0.7 + Math.sin(time * 5) * 0.3})`;
      ctx.fillRect(-6, -11, 12, 3);
      // Rivets
      ctx.fillStyle = flash ? "#fff" : "#c98a4a";
      ctx.fillRect(-9, 2, 3, 3);
      ctx.fillRect(6, 2, 3, 3);
      ctx.fillRect(-9, 9, 3, 3);
      ctx.fillRect(6, 9, 3, 3);
      ctx.save();
      ctx.rotate(e.facing + (windupT > 0 ? -1.4 * windupT : 0.5));
      ctx.strokeStyle = "#7a7a80";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(38, 0);
      ctx.stroke();
      ctx.fillStyle = "#9a9aa0";
      ctx.fillRect(30, -8, 12, 16);
      ctx.restore();
      break;
    }
    case "warden": {
      const glow = 0.6 + Math.sin(time * 3) * 0.3 + windupT * 0.4;
      // Ashen mantle
      ctx.fillStyle = flash ? "#fff" : "#2b2330";
      ctx.beginPath();
      ctx.moveTo(-30, -10);
      ctx.quadraticCurveTo(-34, 26, 0, 30);
      ctx.quadraticCurveTo(34, 26, 30, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, -2, 22, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      // Crystal crown
      ctx.fillStyle = flash ? "#fff" : `rgba(150,230,255,${glow})`;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 9 - 4, -18);
        ctx.lineTo(i * 9, -34 - Math.abs(i) * -3 - (i === 0 ? 8 : 0));
        ctx.lineTo(i * 9 + 4, -18);
        ctx.fill();
      }
      // Eyes
      ctx.fillStyle = `rgba(255,120,60,${glow})`;
      ctx.beginPath();
      ctx.arc(Math.cos(e.facing) * 8 - 6, -8 + Math.sin(e.facing) * 6, 3.5, 0, Math.PI * 2);
      ctx.arc(Math.cos(e.facing) * 8 + 6, -8 + Math.sin(e.facing) * 6, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Giant rusted blade
      ctx.save();
      ctx.rotate(e.facing + (windupT > 0 && e.bossMove === "slam" ? -1.6 * windupT : 0.6));
      ctx.strokeStyle = "#4a3a30";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(50, 0);
      ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : "#8a6a4a";
      ctx.beginPath();
      ctx.moveTo(40, -12);
      ctx.lineTo(84, -4);
      ctx.lineTo(84, 6);
      ctx.lineTo(40, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Slam telegraph
      if (e.state === "windup" && e.bossMove === "slam") {
        ctx.strokeStyle = `rgba(255,120,50,${0.3 + windupT * 0.6})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 120 * (0.5 + windupT * 0.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
  }
  ctx.restore();

  // Health bar for wounded, living enemies (boss uses the HUD bar).
  if (!e.dead && e.hp < e.maxHp && d.id !== "warden") {
    const w = e.r * 2.4;
    const x = e.x - w / 2;
    const y = e.y - e.r - 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = "#b8302a";
    ctx.fillRect(x, y, w * (e.hp / e.maxHp), 3);
  }
  // Windup warning
  if (!e.dead && e.state === "windup" && d.id !== "warden") {
    ctx.fillStyle = "rgba(255,80,60,0.9)";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("!", e.x, e.y - e.r - 16);
  }
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  switch (p.kind) {
    case "ember": {
      ctx.fillStyle = "rgba(255,140,40,0.35)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd070";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff6d0";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "acid": {
      ctx.fillStyle = "#7fd63a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d4ff8a";
      ctx.beginPath();
      ctx.arc(p.x - 1, p.y - 1, p.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "wardenBolt": {
      const flicker = 0.7 + Math.sin(time * 30) * 0.3;
      ctx.fillStyle = `rgba(150,220,255,${0.3 * flicker})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9fe7ff";
      ctx.beginPath();
      ctx.moveTo(p.x + p.vx * 0.03, p.y + p.vy * 0.03);
      ctx.lineTo(p.x - p.vy * 0.02, p.y + p.vx * 0.02);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.lineTo(p.x + p.vy * 0.02, p.y - p.vx * 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "nova":
      break;
  }
}

export function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, time: number): void {
  const bob = Math.sin(time * 4 + p.x * 0.1) * 2;
  shadow(ctx, p.x, p.y + 6, 6, 3);
  const y = p.y + bob;
  switch (p.kind) {
    case "scrap":
      ctx.fillStyle = "#b8873a";
      ctx.beginPath();
      ctx.moveTo(p.x - 5, y + 3);
      ctx.lineTo(p.x - 2, y - 5);
      ctx.lineTo(p.x + 5, y - 3);
      ctx.lineTo(p.x + 4, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8c070";
      ctx.fillRect(p.x - 2, y - 2, 3, 2);
      break;
    case "food":
      ctx.fillStyle = "#8a8f94";
      ctx.fillRect(p.x - 5, y - 6, 10, 12);
      ctx.fillStyle = "#c8442a";
      ctx.fillRect(p.x - 5, y - 2, 10, 4);
      ctx.fillStyle = "#c0c5ca";
      ctx.fillRect(p.x - 5, y - 6, 10, 2);
      break;
    case "shard":
      ctx.fillStyle = `rgba(140,220,255,${0.3 + Math.sin(time * 5) * 0.15})`;
      ctx.beginPath();
      ctx.arc(p.x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#bfefff";
      ctx.beginPath();
      ctx.moveTo(p.x, y - 8);
      ctx.lineTo(p.x + 5, y);
      ctx.lineTo(p.x, y + 8);
      ctx.lineTo(p.x - 5, y);
      ctx.closePath();
      ctx.fill();
      break;
    case "item": {
      const item = p.item!;
      const col = RARITY[item.rarity].color;
      ctx.fillStyle = `${col}55`;
      ctx.beginPath();
      ctx.arc(p.x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      if (item.kind === "weapon") {
        ctx.save();
        ctx.translate(p.x - 10, y + 6);
        ctx.rotate(-0.8);
        drawWeapon(ctx, item, 22);
        ctx.restore();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(p.x - 7, y - 7);
        ctx.lineTo(p.x + 7, y - 7);
        ctx.lineTo(p.x + 6, y + 4);
        ctx.lineTo(p.x, y + 8);
        ctx.lineTo(p.x - 6, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(p.x - 1, y - 5, 2, 9);
      }
      break;
    }
  }
}

export function drawChest(ctx: CanvasRenderingContext2D, c: Chest, time: number): void {
  shadow(ctx, c.x, c.y + 8, 14, 5);
  ctx.fillStyle = c.opened ? "#4a3a2c" : "#6e4a2a";
  ctx.fillRect(c.x - 13, c.y - 6, 26, 16);
  ctx.fillStyle = c.opened ? "#3a2c20" : "#8a5e34";
  ctx.fillRect(c.x - 13, c.y - 10, 26, 6);
  ctx.fillStyle = "#b8873a";
  ctx.fillRect(c.x - 13, c.y - 4, 26, 2);
  ctx.fillRect(c.x - 2, c.y - 6, 4, 5);
  if (!c.opened) {
    const g = 0.4 + Math.sin(time * 3 + c.x) * 0.25;
    ctx.fillStyle = `rgba(255,200,100,${g})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCampfire(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  ctx.fillStyle = "#3a3330";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#4a2f1c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 4);
  ctx.lineTo(x + 12, y - 2);
  ctx.moveTo(x - 10, y - 4);
  ctx.lineTo(x + 10, y + 6);
  ctx.stroke();
  const f = Math.sin(time * 9) * 3;
  ctx.fillStyle = "#ff8a2a";
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.quadraticCurveTo(x - 6 + f, y - 18, x, y - 26 + f);
  ctx.quadraticCurveTo(x + 6 - f, y - 18, x + 8, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd35a";
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.quadraticCurveTo(x - 3 - f, y - 10, x, y - 15 - f);
  ctx.quadraticCurveTo(x + 3 + f, y - 10, x + 4, y);
  ctx.closePath();
  ctx.fill();
}

export function drawTrader(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  shadow(ctx, x, y + 10, 12, 5);
  // Stall
  ctx.fillStyle = "#3b2e24";
  ctx.fillRect(x - 30, y - 34, 60, 6);
  ctx.fillRect(x - 28, y - 30, 4, 34);
  ctx.fillRect(x + 24, y - 30, 4, 34);
  ctx.fillStyle = "#7a3b2a";
  ctx.fillRect(x - 32, y - 40, 64, 8);
  // Body
  ctx.fillStyle = "#4a5a6a";
  ctx.beginPath();
  ctx.moveTo(-11 + x, -4 + y);
  ctx.quadraticCurveTo(x - 13, y + 12, x - 4, y + 13);
  ctx.lineTo(x + 4, y + 13);
  ctx.quadraticCurveTo(x + 13, y + 12, x + 11, y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c8a882";
  ctx.beginPath();
  ctx.arc(x, y - 6, 7, 0, Math.PI * 2);
  ctx.fill();
  // Goggles glinting
  ctx.fillStyle = `rgba(255,220,120,${0.6 + Math.sin(time * 2) * 0.3})`;
  ctx.fillRect(x - 5, y - 8, 4, 3);
  ctx.fillRect(x + 1, y - 8, 4, 3);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(x - 8, y - 14, 16, 4);
}
