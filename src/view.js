export function createView() {
  return {
    cx: 0,
    cy: 0,
    scale: 1,
    reset(w, h) {
      this.cx = w / 2;
      this.cy = h / 2;
      this.scale = 1;
    },
    screenToWorld(x, y) {
      return { x: (x - this.cx) / this.scale, y: (y - this.cy) / this.scale };
    },
    worldToScreen(x, y) {
      return { x: x * this.scale + this.cx, y: y * this.scale + this.cy };
    }
  };
}

export function applyViewTransform(ctx, view) {
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, view.scale);
}
