import type { Game } from "../game/game";
import { itemName, RARITY } from "../items/items";
import { TILE } from "../world/tiles";

export const FONT = '"Courier New", Courier, monospace';

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string, label?: string): void {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = "#1c1816";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, y, w, Math.floor(h / 2));
  if (label) {
    ctx.fillStyle = "#f2e9d8";
    ctx.font = `bold ${Math.max(10, h - 4)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 6, y + h / 2 + 1);
  }
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.78): void {
  ctx.fillStyle = `rgba(14,11,10,${alpha})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(200,170,120,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = "rgba(200,170,120,0.15)";
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
}

export function drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
  if (g.screen === "title") return;
  const p = g.player;
  const W = g.viewW;
  const H = g.viewH;
  ctx.textBaseline = "alphabetic";

  // --- Vitals -----------------------------------------------------------
  const bx = 18;
  let by = 18;
  const bw = 240;
  bar(ctx, bx, by, bw, 18, p.hp / p.maxHp, "#b8302a", `${Math.ceil(p.hp)} / ${p.maxHp}`);
  by += 24;
  bar(ctx, bx, by, bw, 12, p.stamina / p.maxStamina, "#7fa63a");
  by += 18;
  bar(ctx, bx, by, bw, 12, p.glow / p.maxGlow, "#4fb3d9");
  by += 24;

  // Equipment
  ctx.textAlign = "left";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = RARITY[p.weapon.rarity].color;
  ctx.fillText(itemName(p.weapon), bx, by);
  ctx.fillStyle = "#bdb3a4";
  ctx.font = `11px ${FONT}`;
  ctx.fillText(`dmg ${Math.round(p.weapon.damage * p.damageMult)}  reach ${Math.round(p.weapon.range)}  ${(1 / p.weapon.cooldown).toFixed(1)}/s`, bx, by + 14);
  by += 30;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = RARITY[p.armor.rarity].color;
  ctx.fillText(itemName(p.armor), bx, by);
  ctx.fillStyle = "#bdb3a4";
  ctx.font = `11px ${FONT}`;
  ctx.fillText(`defense ${p.armor.defense}`, bx, by + 14);
  by += 34;

  // Consumables & scrap
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#e8c070";
  ctx.fillText(`⚙ ${p.scrap} scrap`, bx, by);
  by += 20;
  ctx.fillStyle = p.food > 0 ? "#e8e0d0" : "#6e665c";
  ctx.fillText(`[1] Canned food x${p.food}`, bx, by);
  by += 18;
  ctx.fillStyle = p.shards > 0 ? "#8ad3f5" : "#6e665c";
  ctx.fillText(`[2] Glow shard x${p.shards}`, bx, by);
  by += 18;
  // Spell cooldowns
  ctx.fillStyle = p.glow >= 18 ? "#ffb347" : "#6e665c";
  ctx.fillText(`[Q] Ember Bolt (18 glow)`, bx, by);
  by += 18;
  ctx.fillStyle = p.glow >= 34 && p.novaCooldown <= 0 ? "#9fe7ff" : "#6e665c";
  ctx.fillText(`[R] Ashen Nova (34 glow)${p.novaCooldown > 0 ? ` ${p.novaCooldown.toFixed(1)}s` : ""}`, bx, by);

  // --- XP / level (bottom centre) -----------------------------------------
  const xw = Math.min(520, W - 360);
  const xx = (W - xw) / 2;
  const xy = H - 30;
  bar(ctx, xx, xy, xw, 10, p.xp / p.xpToNext, "#8a5fd6");
  ctx.textAlign = "center";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#e8e0d0";
  ctx.fillText(`Level ${p.level}`, W / 2, xy - 6);
  if (p.statPoints > 0) {
    ctx.fillStyle = "#c9a0ff";
    ctx.fillText(`${p.statPoints} unspent stat point${p.statPoints > 1 ? "s" : ""} — press Tab`, W / 2, xy - 22);
  }

  // --- Boss bar -----------------------------------------------------------
  const boss = g.boss;
  if (boss && boss.awake && !boss.dead) {
    const bw2 = Math.min(600, W - 300);
    const bx2 = (W - bw2) / 2;
    bar(ctx, bx2, 22, bw2, 16, boss.hp / boss.maxHp, "#c2452f");
    ctx.textAlign = "center";
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = "#ffd9c0";
    ctx.fillText(boss.def.name.toUpperCase(), W / 2, 54);
  }

  // --- Minimap ------------------------------------------------------------
  drawMinimap(ctx, g, W - 200 - 18, 18, 200);

  // --- Objective / stats under minimap ----------------------------------------
  ctx.textAlign = "right";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#bdb3a4";
  const cleared = g.campCleared.filter(Boolean).length;
  ctx.fillText(g.bossDefeated ? "The Warden is dead. The wastes are yours." : "Cross the wastes. Kill the Ash Warden (east).", W - 18, 18 + 200 * (g.world.map.h / g.world.map.w) + 22);
  ctx.fillText(`Camps cleared ${cleared}/${g.camps.length}   Kills ${p.kills}`, W - 18, 18 + 200 * (g.world.map.h / g.world.map.w) + 40);

  // --- Interaction prompt -----------------------------------------------------
  if (g.prompt) {
    ctx.font = `bold 14px ${FONT}`;
    const tw = ctx.measureText(g.prompt).width + 28;
    panel(ctx, (W - tw) / 2, H - 92, tw, 32, 0.85);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd27a";
    ctx.fillText(g.prompt, W / 2, H - 71);
  }

  // --- Toasts -------------------------------------------------------------
  let ty = H - 120;
  ctx.textAlign = "left";
  for (let i = g.toasts.length - 1; i >= 0; i--) {
    const t = g.toasts[i];
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = "#000";
    ctx.fillText(t.text, 19, ty + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 18, ty);
    ty -= 20;
  }
  ctx.globalAlpha = 1;

  // --- Controls hint ------------------------------------------------------
  ctx.textAlign = "right";
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "rgba(190,180,165,0.6)";
  ctx.fillText("WASD move · LMB attack · RMB heavy · Space dodge · Q/R spells · E interact · Tab character · Esc pause", W - 18, H - 14);
}

function drawMinimap(ctx: CanvasRenderingContext2D, g: Game, x: number, y: number, w: number): void {
  const m = g.world.map;
  const scale = w / m.w;
  const h = m.h * scale;
  panel(ctx, x - 4, y - 4, w + 8, h + 8, 0.7);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.minimap, x, y, w, h);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(g.fog, x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();

  const dot = (wx: number, wy: number, color: string, r: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + (wx / TILE) * scale, y + (wy / TILE) * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(g.hearth.x, g.hearth.y, "#ffb347", 3.5);
  dot(m.bossDen.x * TILE, m.bossDen.y * TILE, g.bossDefeated ? "#6e665c" : "#ff4a3a", 4);
  for (let i = 0; i < g.camps.length; i++) {
    const c = g.camps[i];
    if (!g.campDiscovered[i]) continue;
    dot(c.x * TILE, c.y * TILE, g.campCleared[i] ? "#6e8a5c" : "#d67a3a", 2.5);
  }
  const p = g.player;
  dot(p.x, p.y, "#ffffff", 3);
  // Nearby living enemies as faint red pips.
  for (const e of g.enemies) {
    if (e.dead || Math.abs(e.x - p.x) > 700 || Math.abs(e.y - p.y) > 700) continue;
    dot(e.x, e.y, "rgba(255,90,70,0.8)", 1.5);
  }
}
