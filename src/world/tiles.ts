export const TILE = 32;

export enum Tile {
  Ash = 0,
  Cracked = 1,
  Road = 2,
  RubbleFloor = 3,
  HearthFloor = 4,
  Toxic = 5,
  Bones = 6,
  Wall = 7,
  Rock = 8,
  DeadTree = 9,
  Wreck = 10,
  Crystal = 11,
  Void = 12,
  Scorched = 13,
}

export interface TileInfo {
  name: string;
  solid: boolean;
  /** Movement speed multiplier while standing on this tile. */
  speed: number;
  /** Damage per second to anything standing on it. */
  hazard: number;
}

export const TILE_INFO: Record<Tile, TileInfo> = {
  [Tile.Ash]: { name: "Ash Flats", solid: false, speed: 1, hazard: 0 },
  [Tile.Cracked]: { name: "Cracked Earth", solid: false, speed: 1, hazard: 0 },
  [Tile.Road]: { name: "Old Highway", solid: false, speed: 1.1, hazard: 0 },
  [Tile.RubbleFloor]: { name: "Rubble", solid: false, speed: 0.9, hazard: 0 },
  [Tile.HearthFloor]: { name: "Hearth Stone", solid: false, speed: 1, hazard: 0 },
  [Tile.Toxic]: { name: "Glow Sludge", solid: false, speed: 0.55, hazard: 6 },
  [Tile.Bones]: { name: "Bonefield", solid: false, speed: 1, hazard: 0 },
  [Tile.Wall]: { name: "Ruined Wall", solid: true, speed: 0, hazard: 0 },
  [Tile.Rock]: { name: "Boulder", solid: true, speed: 0, hazard: 0 },
  [Tile.DeadTree]: { name: "Dead Tree", solid: true, speed: 0, hazard: 0 },
  [Tile.Wreck]: { name: "Rusted Wreck", solid: true, speed: 0, hazard: 0 },
  [Tile.Crystal]: { name: "Glow Crystal", solid: true, speed: 0, hazard: 0 },
  [Tile.Void]: { name: "The Edge", solid: true, speed: 0, hazard: 0 },
  [Tile.Scorched]: { name: "Scorched Ground", solid: false, speed: 1, hazard: 0 },
};

export function isSolid(t: Tile): boolean {
  return TILE_INFO[t].solid;
}
