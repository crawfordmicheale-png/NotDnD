import { Camera } from "../core/camera";
import { TILE, Tile } from "./tiles";
import { World } from "./world";

const CHUNK = 16;
const CHUNK_PX = CHUNK * TILE;

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Renders the static tile layer using cached, lazily-drawn chunk canvases. */
export class TileRenderer {
  private cache = new Map<number, HTMLCanvasElement>();

  constructor(private world: World) {}

  invalidateAll(): void {
    this.cache.clear();
  }

  invalidateTile(tx: number, ty: number): void {
    this.cache.delete(this.key(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
  }

  private key(cx: number, cy: number): number {
    return cy * 4096 + cx;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const minCx = Math.max(0, Math.floor(cam.left / CHUNK_PX));
    const minCy = Math.max(0, Math.floor(cam.top / CHUNK_PX));
    const maxCx = Math.min(Math.ceil(this.world.map.w / CHUNK) - 1, Math.floor(cam.right / CHUNK_PX));
    const maxCy = Math.min(Math.ceil(this.world.map.h / CHUNK) - 1, Math.floor(cam.bottom / CHUNK_PX));
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const canvas = this.getChunk(cx, cy);
        ctx.drawImage(canvas, cx * CHUNK_PX, cy * CHUNK_PX);
      }
    }
  }

  private getChunk(cx: number, cy: number): HTMLCanvasElement {
    const k = this.key(cx, cy);
    let c = this.cache.get(k);
    if (!c) {
      c = document.createElement("canvas");
      c.width = CHUNK_PX;
      c.height = CHUNK_PX;
      const g = c.getContext("2d")!;
      for (let ty = 0; ty < CHUNK; ty++) {
        for (let tx = 0; tx < CHUNK; tx++) {
          const wx = cx * CHUNK + tx;
          const wy = cy * CHUNK + ty;
          drawTile(g, this.world, wx, wy, tx * TILE, ty * TILE);
        }
      }
      // Second pass: tall objects overlap neighbours, so draw them after the ground.
      for (let ty = 0; ty < CHUNK; ty++) {
        for (let tx = 0; tx < CHUNK; tx++) {
          const wx = cx * CHUNK + tx;
          const wy = cy * CHUNK + ty;
          drawObject(g, this.world, wx, wy, tx * TILE, ty * TILE);
        }
      }
      this.cache.set(k, c);
    }
    return c;
  }
}

function groundColor(t: Tile): string {
  switch (t) {
    case Tile.Ash:
      return "#3b3633";
    case Tile.Cracked:
      return "#5b4a3a";
    case Tile.Road:
      return "#2b2a2c";
    case Tile.RubbleFloor:
      return "#48423e";
    case Tile.HearthFloor:
      return "#5a4f47";
    case Tile.Toxic:
      return "#2f5a24";
    case Tile.Bones:
      return "#3b3633";
    case Tile.Scorched:
      return "#241f1d";
    case Tile.Void:
      return "#050404";
    case Tile.Wall:
      return "#48423e";
    case Tile.Rock:
    case Tile.DeadTree:
    case Tile.Wreck:
    case Tile.Crystal:
      return "#3b3633";
  }
}

function drawTile(g: CanvasRenderingContext2D, world: World, wx: number, wy: number, px: number, py: number): void {
  const t = world.tileAt(wx, wy);
  const r = hash2(wx, wy);
  const r2 = hash2(wx * 7 + 3, wy * 13 + 5);
  g.fillStyle = groundColor(t);
  g.fillRect(px, py, TILE, TILE);

  switch (t) {
    case Tile.Ash:
    case Tile.Rock:
    case Tile.DeadTree:
    case Tile.Wreck:
    case Tile.Crystal:
    case Tile.Bones: {
      // Ash speckles and gentle drifts.
      g.fillStyle = r > 0.5 ? "#433d39" : "#35302d";
      g.fillRect(px + Math.floor(r * 20), py + Math.floor(r2 * 20), 8 + Math.floor(r * 8), 3 + Math.floor(r2 * 3));
      g.fillStyle = "#4a443f";
      for (let i = 0; i < 3; i++) {
        const s = hash2(wx * 31 + i, wy * 17 - i);
        g.fillRect(px + Math.floor(s * 30), py + Math.floor(hash2(wy + i, wx - i) * 30), 2, 2);
      }
      if (t === Tile.Bones) {
        g.fillStyle = "#c9c0ad";
        g.fillRect(px + 6 + Math.floor(r * 10), py + 8 + Math.floor(r2 * 10), 14, 3);
        g.fillRect(px + 4 + Math.floor(r * 10), py + 6 + Math.floor(r2 * 10), 4, 7);
        g.fillRect(px + 18 + Math.floor(r * 8), py + 6 + Math.floor(r2 * 10), 4, 7);
        g.fillStyle = "#e0d7c4";
        g.beginPath();
        g.arc(px + 22 - Math.floor(r * 10), py + 22 - Math.floor(r2 * 8), 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#3b3633";
        g.fillRect(px + 20 - Math.floor(r * 10), py + 21 - Math.floor(r2 * 8), 2, 2);
        g.fillRect(px + 23 - Math.floor(r * 10), py + 21 - Math.floor(r2 * 8), 2, 2);
      }
      break;
    }
    case Tile.Cracked: {
      g.strokeStyle = "#3d3125";
      g.lineWidth = 1.5;
      g.beginPath();
      const sx = px + r * TILE;
      g.moveTo(sx, py);
      g.lineTo(px + r2 * TILE, py + TILE * 0.5);
      g.lineTo(px + (1 - r) * TILE, py + TILE);
      if (r > 0.5) {
        g.moveTo(px, py + r2 * TILE);
        g.lineTo(px + TILE * 0.6, py + r * TILE);
      }
      g.stroke();
      g.fillStyle = "#65533f";
      g.fillRect(px + Math.floor(r2 * 24), py + Math.floor(r * 24), 5, 4);
      break;
    }
    case Tile.Road: {
      g.fillStyle = r > 0.6 ? "#323133" : "#28272a";
      g.fillRect(px + Math.floor(r2 * 16), py + Math.floor(r * 16), 12, 10);
      if (r < 0.2) {
        g.strokeStyle = "#1c1b1d";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px + r2 * TILE, py);
        g.lineTo(px + (1 - r2) * TILE, py + TILE);
        g.stroke();
      }
      // Faded lane paint, only on some tiles for a broken look.
      if (r2 > 0.55 && r > 0.35) {
        g.fillStyle = "rgba(180,150,60,0.28)";
        g.fillRect(px + 14, py + 4, 4, 24);
      }
      break;
    }
    case Tile.RubbleFloor: {
      g.fillStyle = "#3f3936";
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = "#57504b";
      for (let i = 0; i < 4; i++) {
        const s = hash2(wx * 5 + i, wy * 11 + i);
        const s2 = hash2(wy * 3 - i, wx * 19 + i);
        g.fillRect(px + Math.floor(s * 26), py + Math.floor(s2 * 26), 3 + Math.floor(s * 5), 2 + Math.floor(s2 * 4));
      }
      g.fillStyle = "#2e2926";
      g.fillRect(px + Math.floor(r * 24), py + Math.floor(r2 * 24), 6, 5);
      break;
    }
    case Tile.HearthFloor: {
      g.strokeStyle = "#453c35";
      g.lineWidth = 2;
      g.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle = "#645951";
      g.fillRect(px + 4 + Math.floor(r * 8), py + 4 + Math.floor(r2 * 8), 10, 6);
      break;
    }
    case Tile.Toxic: {
      g.fillStyle = "#3c7a2c";
      g.beginPath();
      g.arc(px + 8 + r * 16, py + 8 + r2 * 16, 5 + r * 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#6fcf3e";
      g.beginPath();
      g.arc(px + 4 + r2 * 24, py + 4 + r * 24, 2 + r2 * 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case Tile.Scorched: {
      g.fillStyle = "#1a1615";
      g.fillRect(px + Math.floor(r * 18), py + Math.floor(r2 * 18), 12, 12);
      g.fillStyle = r > 0.8 ? "#5a2a12" : "#2d2624";
      g.fillRect(px + Math.floor(r2 * 26), py + Math.floor(r * 26), 4, 4);
      break;
    }
    case Tile.Wall: {
      // Ruined concrete block: lighter cap, darker face, exposed rebar.
      g.fillStyle = "#3a332f";
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = "#6b625a";
      g.fillRect(px, py, TILE, TILE - 8);
      g.fillStyle = "#7d746b";
      g.fillRect(px, py, TILE, 6);
      g.fillStyle = "#524a44";
      g.fillRect(px + Math.floor(r * 20), py + 8 + Math.floor(r2 * 12), 8, 4);
      g.fillRect(px + Math.floor(r2 * 24), py + 14, 4, 6);
      if (r > 0.7) {
        g.strokeStyle = "#8a4a2a";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px + 6 + r2 * 18, py + 2);
        g.lineTo(px + 8 + r2 * 18, py - 5);
        g.stroke();
      }
      break;
    }
    case Tile.Void:
      break;
  }
}

function drawObject(g: CanvasRenderingContext2D, world: World, wx: number, wy: number, px: number, py: number): void {
  const t = world.tileAt(wx, wy);
  const r = hash2(wx, wy);
  const r2 = hash2(wx * 7 + 3, wy * 13 + 5);
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;
  switch (t) {
    case Tile.Rock: {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(cx + 2, cy + 8, 15, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5e5a56";
      g.beginPath();
      g.moveTo(px + 3, py + 26);
      g.lineTo(px + 2 + r * 6, py + 10);
      g.lineTo(px + 12 + r2 * 6, py + 3);
      g.lineTo(px + 26, py + 8 + r * 6);
      g.lineTo(px + 30, py + 24);
      g.closePath();
      g.fill();
      g.fillStyle = "#7a7570";
      g.beginPath();
      g.moveTo(px + 2 + r * 6, py + 10);
      g.lineTo(px + 12 + r2 * 6, py + 3);
      g.lineTo(px + 26, py + 8 + r * 6);
      g.lineTo(px + 16, py + 14);
      g.closePath();
      g.fill();
      break;
    }
    case Tile.DeadTree: {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(cx, py + 29, 9, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#2f241c";
      g.lineWidth = 5;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx, py + 30);
      g.lineTo(cx + (r - 0.5) * 6, py + 10);
      g.stroke();
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx + (r - 0.5) * 4, py + 16);
      g.lineTo(cx - 10 - r * 4, py + 4 + r2 * 6);
      g.moveTo(cx + (r - 0.5) * 6, py + 12);
      g.lineTo(cx + 9 + r2 * 5, py + 2 + r * 4);
      g.moveTo(cx + (r - 0.5) * 6, py + 10);
      g.lineTo(cx + (r2 - 0.5) * 6, py - 4);
      g.stroke();
      break;
    }
    case Tile.Wreck: {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(px + 2, py + 20, 30, 10);
      g.fillStyle = r > 0.5 ? "#6e3a1f" : "#5c4a3a";
      g.fillRect(px + 2, py + 8, 28, 18);
      g.fillStyle = "#8a4b28";
      g.fillRect(px + 2, py + 8, 28, 5);
      g.fillStyle = "#1f2426";
      g.fillRect(px + 8, py + 12, 7, 6);
      g.fillRect(px + 18, py + 12, 7, 6);
      g.fillStyle = "#2a2422";
      g.beginPath();
      g.arc(px + 8, py + 27, 4, 0, Math.PI * 2);
      g.arc(px + 24, py + 27, 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case Tile.Crystal: {
      g.fillStyle = "rgba(120,220,255,0.15)";
      g.beginPath();
      g.ellipse(cx, cy + 6, 16, 10, 0, 0, Math.PI * 2);
      g.fill();
      const shard = (ox: number, h: number, wdt: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(cx + ox - wdt, py + 28);
        g.lineTo(cx + ox, py + 28 - h);
        g.lineTo(cx + ox + wdt, py + 28);
        g.closePath();
        g.fill();
      };
      shard(-8 + r * 4, 14 + r2 * 6, 4, "#5fb9e6");
      shard(6 - r2 * 4, 12 + r * 6, 4, "#8ad3f5");
      shard(0, 22 + r * 6, 5, "#bfefff");
      break;
    }
    default:
      break;
  }
}
