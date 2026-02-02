export class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.map = new Map();
  }

  _key(ix, iy) {
    return `${ix},${iy}`;
  }

  _cellRange(bounds) {
    const cs = this.cellSize;
    const minX = Math.floor(bounds.minX / cs);
    const maxX = Math.floor(bounds.maxX / cs);
    const minY = Math.floor(bounds.minY / cs);
    const maxY = Math.floor(bounds.maxY / cs);
    return { minX, maxX, minY, maxY };
  }

  insert(item, bounds) {
    const r = this._cellRange(bounds);
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = r.minX; x <= r.maxX; x++) {
        const key = this._key(x, y);
        let bucket = this.map.get(key);
        if (!bucket) {
          bucket = [];
          this.map.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  remove(item, bounds) {
    const r = this._cellRange(bounds);
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = r.minX; x <= r.maxX; x++) {
        const key = this._key(x, y);
        const bucket = this.map.get(key);
        if (!bucket) continue;
        const idx = bucket.indexOf(item);
        if (idx >= 0) bucket.splice(idx, 1);
        if (!bucket.length) this.map.delete(key);
      }
    }
  }

  query(bounds) {
    const r = this._cellRange(bounds);
    const out = [];
    const seen = new Set();
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = r.minX; x <= r.maxX; x++) {
        const key = this._key(x, y);
        const bucket = this.map.get(key);
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          out.push(item);
        }
      }
    }
    return out;
  }
}
