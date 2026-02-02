class View {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.scale = 1;
    this.minScale = 0.2;
    this.maxScale = 6;
  }

  resetToFit(bounds, viewportW, viewportH, paddingPx = 24) {
    if (!bounds || !isFinite(bounds.minX) || !isFinite(bounds.maxX)) return;
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    const pad = Math.max(0, paddingPx);
    const targetW = Math.max(1, viewportW - pad * 2);
    const targetH = Math.max(1, viewportH - pad * 2);
    const scale = Math.min(targetW / bw, targetH / bh);
    this.scale = clamp(scale, this.minScale, this.maxScale);

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    this.cx = viewportW / 2 - midX * this.scale;
    this.cy = viewportH / 2 - midY * this.scale;
  }

  screenToWorld(a, b) {
    const p = typeof a === "object" ? a : { x: a, y: b };
    return { x: (p.x - this.cx) / this.scale, y: (p.y - this.cy) / this.scale };
  }

  worldToScreen(a, b) {
    const p = typeof a === "object" ? a : { x: a, y: b };
    return { x: p.x * this.scale + this.cx, y: p.y * this.scale + this.cy };
  }

  zoomAtScreenPoint(screenPt, zoomFactor) {
    if (!screenPt || !isFinite(zoomFactor)) return;
    const worldPt = this.screenToWorld(screenPt);
    const nextScale = clamp(this.scale * zoomFactor, this.minScale, this.maxScale);
    this.scale = nextScale;
    this.cx = screenPt.x - worldPt.x * this.scale;
    this.cy = screenPt.y - worldPt.y * this.scale;
  }

  panByScreenDelta(dx, dy) {
    this.cx += dx;
    this.cy += dy;
  }
}

export function createView() {
  return new View();
}

export function applyViewTransform(ctx, view) {
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, view.scale);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
