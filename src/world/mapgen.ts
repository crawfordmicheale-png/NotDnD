import { Noise2D } from "../core/noise";
import { Rng } from "../core/rng";
import { Tile, isSolid } from "./tiles";

export interface TilePos {
  x: number;
  y: number;
}

export interface Camp {
  x: number;
  y: number;
  radius: number;
  /** 1 (near the Hearth) .. 4 (near the Warden's den). */
  tier: number;
  kind: "scav" | "hound" | "husk" | "rust" | "mixed";
}

export interface MapData {
  w: number;
  h: number;
  tiles: Uint8Array;
  hearth: TilePos;
  bossDen: TilePos;
  camps: Camp[];
  chests: TilePos[];
  crystals: TilePos[];
  seed: number;
}

export interface MapGenOptions {
  width?: number;
  height?: number;
  camps?: number;
}

export function generateMap(seed: number, opts: MapGenOptions = {}): MapData {
  const w = opts.width ?? 150;
  const h = opts.height ?? 130;
  const rng = new Rng(seed);
  const elevation = new Noise2D(seed ^ 0x1111);
  const toxicity = new Noise2D(seed ^ 0x2222);
  const forest = new Noise2D(seed ^ 0x3333);
  const detail = new Noise2D(seed ^ 0x4444);
  const tiles = new Uint8Array(w * h);

  const idx = (x: number, y: number) => y * w + x;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const get = (x: number, y: number): Tile => (inBounds(x, y) ? (tiles[idx(x, y)] as Tile) : Tile.Void);
  const set = (x: number, y: number, t: Tile) => {
    if (inBounds(x, y)) tiles[idx(x, y)] = t;
  };

  // --- Base terrain -------------------------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = elevation.fbm(x / 28, y / 28, 4);
      const t = toxicity.fbm(x / 18, y / 18, 3);
      const d = detail.value(x / 3, y / 3);
      let tile: Tile = Tile.Ash;
      if (e > 0.62) tile = Tile.Cracked;
      if (e > 0.58 && d > 0.55) tile = Tile.Cracked;
      if (e < 0.4 && t > 0.62) tile = Tile.Toxic;
      if (e > 0.72 && d > 0.62) tile = Tile.Rock;
      if (e > 0.76) tile = Tile.Rock;
      const f = forest.fbm(x / 14, y / 14, 3);
      if (f > 0.6 && tile !== Tile.Toxic && tile !== Tile.Rock && d > 0.45 && rng.chance(0.35)) tile = Tile.DeadTree;
      if (tile === Tile.Ash && d > 0.8 && rng.chance(0.15)) tile = Tile.Bones;
      if (tile === Tile.Ash && t > 0.55 && t < 0.62 && e < 0.42) tile = Tile.Scorched;
      tiles[idx(x, y)] = tile;
    }
  }

  // --- Key locations ------------------------------------------------------
  const hearth: TilePos = { x: Math.floor(w * 0.12), y: Math.floor(h * 0.5) + rng.int(-8, 8) };
  const bossDen: TilePos = { x: Math.floor(w * 0.88), y: Math.floor(h * 0.5) + rng.int(-10, 10) };

  // --- Old highways (also guarantee hearth <-> den connectivity) -----------
  const carveRoad = (from: TilePos, to: TilePos, width: number, wobble: number) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 2;
    let offset = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      offset += rng.range(-wobble, wobble);
      offset *= 0.92;
      const cx = Math.round(from.x + (to.x - from.x) * t + (Math.abs(to.y - from.y) > Math.abs(to.x - from.x) ? offset : 0));
      const cy = Math.round(from.y + (to.y - from.y) * t + (Math.abs(to.y - from.y) > Math.abs(to.x - from.x) ? 0 : offset));
      for (let dy = -width; dy <= width; dy++) {
        for (let dx = -width; dx <= width; dx++) {
          if (dx * dx + dy * dy <= width * width + 1) set(cx + dx, cy + dy, Tile.Road);
        }
      }
    }
  };
  carveRoad(hearth, bossDen, 1, 0.9);
  carveRoad({ x: Math.floor(w * 0.5) + rng.int(-10, 10), y: 2 }, { x: Math.floor(w * 0.5) + rng.int(-10, 10), y: h - 3 }, 1, 0.8);
  carveRoad({ x: Math.floor(w * 0.3), y: 2 }, { x: Math.floor(w * 0.7), y: h - 3 }, 0, 1.2);

  // Roadside wrecks
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (get(x, y) === Tile.Road && rng.chance(0.012)) {
        let nearRoadEdge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y + dy) !== Tile.Road) nearRoadEdge = true;
        if (nearRoadEdge) set(x, y, Tile.Wreck);
      }
    }
  }

  // --- Ruined buildings ---------------------------------------------------
  const chests: TilePos[] = [];
  const ruinCount = Math.floor((w * h) / 520);
  for (let i = 0; i < ruinCount; i++) {
    const rw = rng.int(5, 12);
    const rh = rng.int(5, 10);
    const rx = rng.int(3, w - rw - 4);
    const ry = rng.int(3, h - rh - 4);
    if (Math.hypot(rx - hearth.x, ry - hearth.y) < 14 || Math.hypot(rx - bossDen.x, ry - bossDen.y) < 16) continue;
    let touchesRoad = false;
    for (let y = ry; y < ry + rh && !touchesRoad; y++)
      for (let x = rx; x < rx + rw; x++) if (get(x, y) === Tile.Road) { touchesRoad = true; break; }
    if (touchesRoad && rng.chance(0.7)) continue;
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (get(x, y) === Tile.Road) continue; // highways cut straight through collapsed buildings
        const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
        if (edge) {
          // Crumbled walls: most stand, some are gone.
          set(x, y, rng.chance(0.78) ? Tile.Wall : Tile.RubbleFloor);
        } else {
          set(x, y, rng.chance(0.08) ? Tile.Wall : Tile.RubbleFloor);
        }
      }
    }
    // Guaranteed doorway on a random side.
    const side = rng.int(0, 3);
    const dx = side === 0 ? rx : side === 1 ? rx + rw - 1 : rng.int(rx + 1, rx + rw - 2);
    const dy = side === 2 ? ry : side === 3 ? ry + rh - 1 : rng.int(ry + 1, ry + rh - 2);
    set(dx, dy, Tile.RubbleFloor);
    if (rng.chance(0.45)) chests.push({ x: rng.int(rx + 1, rx + rw - 2), y: rng.int(ry + 1, ry + rh - 2) });
  }

  // --- Glow crystal fields (the wasteland's strange magic) ----------------
  const crystals: TilePos[] = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const t = toxicity.fbm(x / 18, y / 18, 3);
      const tile = get(x, y);
      if (t > 0.66 && (tile === Tile.Ash || tile === Tile.Scorched || tile === Tile.Cracked) && rng.chance(0.05)) {
        set(x, y, Tile.Crystal);
        crystals.push({ x, y });
      }
    }
  }

  // --- The Hearth (safe camp) --------------------------------------------
  const clearCircle = (c: TilePos, r: number, floor: Tile) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(c.x + x, c.y + y, floor);
  };
  clearCircle(hearth, 7, Tile.HearthFloor);
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const px = Math.round(hearth.x + Math.cos(a) * 7.5);
    const py = Math.round(hearth.y + Math.sin(a) * 7.5);
    // Palisade with gaps toward the east (the road) and a few crumbles.
    const facingRoad = Math.abs(a) < 0.45 || Math.abs(a - Math.PI * 2) < 0.45;
    if (!facingRoad && rng.chance(0.85) && get(px, py) !== Tile.Road) set(px, py, Tile.Wall);
  }

  // --- The Warden's den --------------------------------------------------
  clearCircle(bossDen, 11, Tile.Scorched);
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    const r = 11.5 + rng.range(0, 1.2);
    const px = Math.round(bossDen.x + Math.cos(a) * r);
    const py = Math.round(bossDen.y + Math.sin(a) * r);
    const facingRoad = Math.abs(a - Math.PI) < 0.4;
    if (!facingRoad && get(px, py) !== Tile.Road) set(px, py, rng.chance(0.6) ? Tile.Rock : Tile.Bones);
  }
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(3, 10);
    set(Math.round(bossDen.x + Math.cos(a) * r), Math.round(bossDen.y + Math.sin(a) * r), Tile.Bones);
  }

  // --- Border -------------------------------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) set(x, y, Tile.Void);
      else if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) {
        if (get(x, y) !== Tile.Road || x < 3 || y < 3 || x >= w - 3 || y >= h - 3) set(x, y, Tile.Rock);
      }
    }
  }

  // --- Connectivity: seal off everything the player cannot reach ----------
  let reachable = floodFill(tiles, w, h, hearth);
  if (!reachable[idx(bossDen.x, bossDen.y)]) {
    // Something collapsed across the highway; bulldoze a straight route.
    carveRoad(hearth, bossDen, 1, 0);
    reachable = floodFill(tiles, w, h, hearth);
  }
  for (let i = 0; i < tiles.length; i++) {
    if (!reachable[i] && !isSolid(tiles[i] as Tile)) tiles[i] = Tile.Rock;
  }

  // --- Enemy camps --------------------------------------------------------
  const camps: Camp[] = [];
  const campTarget = opts.camps ?? 12;
  const maxDist = Math.hypot(bossDen.x - hearth.x, bossDen.y - hearth.y);
  let attempts = 0;
  while (camps.length < campTarget && attempts < 4000) {
    attempts++;
    const x = rng.int(8, w - 9);
    const y = rng.int(8, h - 9);
    if (!reachable[idx(x, y)]) continue;
    const dHearth = Math.hypot(x - hearth.x, y - hearth.y);
    const dBoss = Math.hypot(x - bossDen.x, y - bossDen.y);
    if (dHearth < 22 || dBoss < 18) continue;
    if (camps.some((c) => Math.hypot(c.x - x, c.y - y) < 20)) continue;
    // Camps want open ground.
    let open = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!isSolid(get(x + dx, y + dy))) open++;
    if (open < 34) continue;
    const progress = Math.min(1, dHearth / maxDist);
    const tier = 1 + Math.min(3, Math.floor(progress * 3.6));
    const kinds: Camp["kind"][] = tier === 1 ? ["scav", "hound"] : tier === 2 ? ["scav", "hound", "husk"] : tier === 3 ? ["husk", "rust", "mixed"] : ["rust", "mixed"];
    camps.push({ x, y, radius: rng.int(4, 6), tier, kind: rng.pick(kinds) });
    // Decorate: a scattering of bones, a wreck or two, and a stash.
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1, 4);
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      if (!isSolid(get(px, py))) set(px, py, i < 4 ? Tile.Bones : Tile.Scorched);
    }
    chests.push({ x, y });
  }

  // Drop chests that ended up inside something solid or unreachable.
  const validChests = chests.filter((c) => inBounds(c.x, c.y) && !isSolid(get(c.x, c.y)) && reachable[idx(c.x, c.y)]);

  return { w, h, tiles, hearth, bossDen, camps, chests: validChests, crystals, seed };
}

/** BFS over non-solid tiles from a start position. Returns a reachability mask. */
export function floodFill(tiles: Uint8Array, w: number, h: number, start: TilePos): Uint8Array {
  const seen = new Uint8Array(w * h);
  const queue: number[] = [];
  const s = start.y * w + start.x;
  if (isSolid(tiles[s] as Tile)) return seen;
  seen[s] = 1;
  queue.push(s);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
    const valid = [cx > 0, cx < w - 1, cy > 0, cy < h - 1];
    for (let i = 0; i < 4; i++) {
      if (!valid[i]) continue;
      const n = neighbors[i];
      if (seen[n] || isSolid(tiles[n] as Tile)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}
