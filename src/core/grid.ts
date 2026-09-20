export interface GridItem {
  x: number;
  y: number;
}

/** Rebuilding is stamp-based; this is when the counter is folded back to keep it exact. */
const GENERATION_LIMIT = 0x3fffffff;

/**
 * Uniform spatial hash over a fixed world rectangle, rebuilt each frame into flat typed
 * arrays — no per-frame allocation and no per-cell arrays.
 *
 * It exists so neighbour work costs what the local crowd costs rather than what the whole
 * population costs: an all-pairs sweep over n entities is n^2/2 checks however spread out
 * they are, while this only looks at the cells a query actually overlaps.
 *
 * Building touches only the cells that actually receive an item. A generation stamp marks
 * which cells belong to the current build, so stale ones read as empty without anyone
 * having to clear them. That matters more than it sounds: a map-sized grid has thousands
 * of cells but a scene only has hundreds of entities, and clearing every cell each frame
 * would cost more than the pair sweep this replaces.
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;

  /** Which build last wrote a cell; anything older is treated as empty. */
  private readonly stamp: Int32Array;
  /** Offset of a cell's run inside `items`, valid only for the current generation. */
  private readonly start: Int32Array;
  /** Item count in a cell, reused as the write cursor while placing. */
  private readonly len: Int32Array;
  /** Cells written this build, so the next one need not scan the whole grid. */
  private touched: Int32Array;
  private touchedCount = 0;

  private items: Int32Array;
  private generation = 0;
  private size = 0;

  constructor(widthPx: number, heightPx: number, readonly cellSize: number, capacity = 256) {
    this.cols = Math.max(1, Math.ceil(widthPx / cellSize));
    this.rows = Math.max(1, Math.ceil(heightPx / cellSize));
    const cells = this.cols * this.rows;
    this.stamp = new Int32Array(cells);
    this.start = new Int32Array(cells);
    this.len = new Int32Array(cells);
    this.touched = new Int32Array(Math.max(1, capacity));
    this.items = new Int32Array(Math.max(1, capacity));
  }

  /** How many items the last build indexed. */
  get count(): number {
    return this.size;
  }

  /** Positions outside the rectangle clamp into the edge cells, so nothing is ever lost. */
  private cellOf(x: number, y: number): number {
    let cx = Math.floor(x / this.cellSize);
    let cy = Math.floor(y / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  /**
   * Index `items`, skipping any the predicate rejects. Stored values are indices into the
   * array passed in, so callers read the entities back themselves.
   */
  build<T extends GridItem>(items: readonly T[], isActive?: (item: T, index: number) => boolean): void {
    const { stamp, start, len } = this;
    const n = items.length;
    if (this.items.length < n) this.items = new Int32Array(n * 2);
    if (this.touched.length < n) this.touched = new Int32Array(n * 2);

    // Folding the counter is only needed once every billion builds, but leaving it out
    // would silently resurrect stale cells when it wrapped.
    if (++this.generation >= GENERATION_LIMIT) {
      stamp.fill(0);
      this.generation = 1;
    }
    const gen = this.generation;
    let touchedCount = 0;

    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (isActive && !isActive(it, i)) continue;
      const c = this.cellOf(it.x, it.y);
      if (stamp[c] !== gen) {
        stamp[c] = gen;
        len[c] = 0;
        this.touched[touchedCount++] = c;
      }
      len[c]++;
    }

    let acc = 0;
    for (let t = 0; t < touchedCount; t++) {
      const c = this.touched[t];
      start[c] = acc;
      acc += len[c];
      len[c] = 0; // reused below as the per-cell write cursor
    }
    this.size = acc;
    this.touchedCount = touchedCount;

    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (isActive && !isActive(it, i)) continue;
      const c = this.cellOf(it.x, it.y);
      this.items[start[c] + len[c]++] = i;
    }
  }

  /**
   * Collect the indices of every indexed item in the cells overlapping the query circle
   * into `out`, returning how many were written. Results are cell-granular, so callers
   * still test real distances; `out` must hold at least `count` entries.
   */
  query(x: number, y: number, radius: number, out: Int32Array): number {
    const { cols, rows, cellSize, stamp, start, len, items } = this;
    const gen = this.generation;
    let minCx = Math.floor((x - radius) / cellSize);
    let maxCx = Math.floor((x + radius) / cellSize);
    let minCy = Math.floor((y - radius) / cellSize);
    let maxCy = Math.floor((y + radius) / cellSize);
    if (minCx < 0) minCx = 0;
    if (minCy < 0) minCy = 0;
    if (maxCx >= cols) maxCx = cols - 1;
    if (maxCy >= rows) maxCy = rows - 1;

    let n = 0;
    const limit = out.length;
    for (let cy = minCy; cy <= maxCy; cy++) {
      const row = cy * cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const c = row + cx;
        if (stamp[c] !== gen) continue; // not written this build: empty
        const from = start[c];
        const end = from + len[c];
        for (let k = from; k < end && n < limit; k++) out[n++] = items[k];
      }
    }
    return n;
  }

  /** How many cells the last build actually wrote to — useful for sanity checks. */
  get occupiedCells(): number {
    return this.touchedCount;
  }
}
