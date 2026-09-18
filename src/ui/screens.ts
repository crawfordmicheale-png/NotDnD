import type { Game } from "../game/game";
import { STAT_INFO, StatName } from "../entities/player";
import { itemName, RARITY } from "../items/items";
import { FONT, panel } from "./hud";

function dim(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 0.6): void {
  ctx.fillStyle = `rgba(4,3,3,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function title(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = "#e8c070"): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillText(text, x + 3, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function lines(ctx: CanvasRenderingContext2D, items: string[], x: number, y: number, lh: number, color = "#d8cfbe", size = 14, align: CanvasTextAlign = "left"): number {
  ctx.textAlign = align;
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  for (const l of items) {
    ctx.fillText(l, x, y);
    y += lh;
  }
  return y;
}

export function drawScreens(ctx: CanvasRenderingContext2D, g: Game): void {
  const W = g.canvas.width;
  const H = g.canvas.height;
  switch (g.screen) {
    case "title":
      drawTitle(ctx, g, W, H);
      break;
    case "paused":
      dim(ctx, W, H, 0.55);
      title(ctx, "PAUSED", W / 2, H / 2 - 40, 42);
      lines(ctx, ["Esc / P — resume", "R — abandon run and start a new wasteland", "M — toggle sound"], W / 2, H / 2 + 10, 22, "#d8cfbe", 15, "center");
      lines(ctx, [`Seed: ${g.seedName}`], W / 2, H / 2 + 90, 20, "#8a8074", 12, "center");
      break;
    case "character":
      drawCharacter(ctx, g, W, H);
      break;
    case "trader":
      drawTrader(ctx, g, W, H);
      break;
    case "dead":
      dim(ctx, W, H, 0.7);
      title(ctx, "CLAIMED BY THE ASH", W / 2, H / 2 - 50, 44, "#c2452f");
      lines(
        ctx,
        [
          `Level ${g.player.level} · ${g.player.kills} kills · ${g.player.campsCleared} camps cleared · ${formatTime(g.runTime)}`,
          "",
          "The Hearth's fire still burns. You will wake there, lighter by some scrap.",
          "",
          "Press Enter to rise",
        ],
        W / 2,
        H / 2 + 4,
        22,
        "#d8cfbe",
        15,
        "center",
      );
      break;
    case "victory":
      dim(ctx, W, H, 0.7);
      title(ctx, "THE WARDEN FALLS", W / 2, H / 2 - 60, 46, "#9fe7ff");
      lines(
        ctx,
        [
          "Its crystal crown shatters and the glow bleeds back into the dirt.",
          "For the first time in three hundred years, the wind across the wastes carries no screaming.",
          "",
          `Level ${g.player.level} · ${g.player.kills} kills · ${g.player.deaths} deaths · ${formatTime(g.runTime)} · Seed ${g.seedName}`,
          "",
          "Press Enter to keep wandering — or Esc then R for a new wasteland",
        ],
        W / 2,
        H / 2 - 6,
        22,
        "#d8cfbe",
        15,
        "center",
      );
      break;
    case "playing":
      break;
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, g: Game, W: number, H: number): void {
  dim(ctx, W, H, 0.62);
  const t = g.time;
  // Drifting ash motes
  ctx.fillStyle = "rgba(200,190,170,0.35)";
  for (let i = 0; i < 60; i++) {
    const x = ((i * 137.5 + t * (8 + (i % 5) * 3)) % (W + 40)) - 20;
    const y = ((i * 83.7 + t * (14 + (i % 7) * 2)) % (H + 40)) - 20;
    ctx.fillRect(x, y, 2, 2);
  }
  title(ctx, "ASHFALL", W / 2, H * 0.3, 84);
  title(ctx, "WASTELAND RECKONING", W / 2, H * 0.3 + 34, 20, "#bdb3a4");

  const lore = [
    "Three hundred years since the Collapse. The old world is rust and rumor.",
    "Something bled out of the machines when they died — the wastelanders call it the Glow.",
    "It twists what it touches. It also answers, if you learn to ask.",
    "",
    "East, past the scav camps and husk gatherings, the Ash Warden sits in its bone-ringed den.",
    "Kill it, and the wastes might learn to be quiet.",
  ];
  lines(ctx, lore, W / 2, H * 0.3 + 78, 20, "#d8cfbe", 14, "center");

  const pulse = 0.6 + Math.sin(t * 3) * 0.35;
  ctx.fillStyle = `rgba(255,210,122,${pulse})`;
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Press Enter or click to begin", W / 2, H * 0.3 + 230);

  const cw = 560;
  const cx = (W - cw) / 2;
  const cy = H * 0.3 + 258;
  panel(ctx, cx, cy, cw, 176, 0.6);
  const left = ["WASD / arrows — move", "Mouse — aim", "Left click (hold) — light attack", "Right click / Shift+click — heavy attack", "Space — dodge roll (i-frames)", "1 / 2 — canned food / glow shard"];
  const right = ["Q — Ember Bolt", "R — Ashen Nova", "E — interact / take gear", "F — salvage gear for scrap", "Tab — character sheet", "N — new wasteland seed"];
  lines(ctx, left, cx + 22, cy + 30, 22, "#d8cfbe", 13);
  lines(ctx, right, cx + cw / 2 + 10, cy + 30, 22, "#d8cfbe", 13);

  ctx.textAlign = "center";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#8a8074";
  ctx.fillText(`Wasteland seed: ${g.seedName}`, W / 2, H - 24);
}

function drawCharacter(ctx: CanvasRenderingContext2D, g: Game, W: number, H: number): void {
  dim(ctx, W, H, 0.6);
  const p = g.player;
  const pw = 680;
  const ph = 440;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph, 0.9);
  title(ctx, "WANDERER", W / 2, py + 44, 28);
  ctx.textAlign = "center";
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "#bdb3a4";
  ctx.fillText(`Level ${p.level} · ${p.xp}/${p.xpToNext} xp · ${p.statPoints} point${p.statPoints === 1 ? "" : "s"} to spend`, W / 2, py + 68);

  const stats: StatName[] = ["vigor", "might", "agility", "attunement"];
  let y = py + 110;
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const info = STAT_INFO[s];
    ctx.textAlign = "left";
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = p.statPoints > 0 ? "#ffd27a" : "#8a8074";
    ctx.fillText(`[${i + 1}]`, px + 30, y);
    ctx.fillStyle = "#e8e0d0";
    ctx.fillText(`${info.name}`, px + 70, y);
    ctx.fillStyle = "#c9a0ff";
    ctx.fillText(`${p.stats[s]}`, px + 210, y);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#bdb3a4";
    ctx.fillText(info.desc, px + 250, y);
    y += 34;
  }

  y += 10;
  ctx.strokeStyle = "rgba(200,170,120,0.3)";
  ctx.beginPath();
  ctx.moveTo(px + 24, y - 20);
  ctx.lineTo(px + pw - 24, y - 20);
  ctx.stroke();

  const derived = [
    `Health ${Math.ceil(p.hp)}/${p.maxHp}   Regen ${p.hpRegen.toFixed(1)}/s`,
    `Stamina ${p.maxStamina}   Glow ${p.maxGlow}`,
    `Move speed ${Math.round(p.moveSpeed)}   Melee damage x${p.damageMult.toFixed(2)}`,
    `Spell damage ${Math.round(p.spellDamage)}   Defense ${p.armor.defense}`,
  ];
  lines(ctx, derived, px + 30, y, 22, "#d8cfbe", 13);

  ctx.textAlign = "left";
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = RARITY[p.weapon.rarity].color;
  ctx.fillText(itemName(p.weapon), px + 360, y);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#bdb3a4";
  ctx.fillText(`${p.weapon.base.flavor}`, px + 360, y + 18);
  ctx.fillText(`dmg ${p.weapon.damage} · reach ${Math.round(p.weapon.range)} · arc ${Math.round((p.weapon.arc * 180) / Math.PI)}° · ${p.weapon.cooldown.toFixed(2)}s`, px + 360, y + 34);
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = RARITY[p.armor.rarity].color;
  ctx.fillText(itemName(p.armor), px + 360, y + 66);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#bdb3a4";
  ctx.fillText(`defense ${p.armor.defense} · speed -${Math.round(p.armor.speedPenalty * 100)}%`, px + 360, y + 84);

  lines(ctx, [`Kills ${p.kills} · Camps cleared ${p.campsCleared} · Deaths ${p.deaths} · ${formatTime(g.runTime)}`], W / 2, py + ph - 48, 20, "#8a8074", 12, "center");
  lines(ctx, ["Tab / Esc — close"], W / 2, py + ph - 24, 20, "#ffd27a", 13, "center");
}

function drawTrader(ctx: CanvasRenderingContext2D, g: Game, W: number, H: number): void {
  dim(ctx, W, H, 0.6);
  const p = g.player;
  const pw = 640;
  const ph = 400;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  panel(ctx, px, py, pw, ph, 0.9);
  title(ctx, "MARROW, TRADER OF THE HEARTH", W / 2, py + 44, 22);
  lines(ctx, ['"Scrap talks. What are you buying, wanderer?"'], W / 2, py + 70, 20, "#bdb3a4", 13, "center");
  ctx.textAlign = "right";
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = "#e8c070";
  ctx.fillText(`⚙ ${p.scrap} scrap`, px + pw - 30, py + 70);

  const offers = g.traderOffers();
  let y = py + 112;
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const can = p.scrap >= o.cost && o.available;
    ctx.textAlign = "left";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = can ? "#ffd27a" : "#6e665c";
    ctx.fillText(`[${i + 1}]`, px + 30, y);
    ctx.fillStyle = can ? "#e8e0d0" : "#8a8074";
    ctx.fillText(o.label, px + 70, y);
    ctx.textAlign = "right";
    ctx.fillStyle = can ? "#e8c070" : "#8a8074";
    ctx.fillText(`${o.cost}`, px + pw - 30, y);
    y += 34;
  }
  lines(ctx, ["Crates drop the item at your feet — E to take, F to salvage.", "E / Esc — leave"], W / 2, py + ph - 48, 22, "#ffd27a", 13, "center");
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
