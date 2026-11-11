// Shared canvas primitives. World units: 1 unit = 32 source pixels (sprite PPU), y up.
import type { ColorName } from "../data";
import { getImage, getTinted, rgbOf, tex, type Rgb } from "../assets";

export interface View {
  w: number;
  h: number;
  ppu: number;
  camX: number;
  camY: number;
}

export interface DrawOpts {
  color?: ColorName | Rgb | null | undefined;
  alpha?: number | undefined;
  flipX?: boolean | undefined;
  rot?: number | undefined;
  sx?: number | undefined;
  sy?: number | undefined;
}

export type FrameAnim = { frames: string[]; fps: number; start: number; loop: boolean };

export function screenToWorld(v: View, sx: number, sy: number) {
  return { x: (sx - v.w / 2) / v.ppu + v.camX, y: -(sy - v.h / 2) / v.ppu + v.camY };
}

export function worldToScreen(v: View, x: number, y: number) {
  return { x: (x - v.camX) * v.ppu + v.w / 2, y: v.h / 2 - (y - v.camY) * v.ppu };
}

export function drawSrc(
  ctx: CanvasRenderingContext2D,
  v: View,
  src: string,
  x: number,
  y: number,
  o: DrawOpts = {},
) {
  const img = getImage(src);
  if (!img) return;
  const color = o.color ? (typeof o.color === "string" ? rgbOf(o.color) : o.color) : null;
  const drawable: CanvasImageSource | undefined = color ? getTinted(src, color) : img;
  if (!drawable) return;
  const w = (img.naturalWidth / 32) * v.ppu * (o.sx ?? 1);
  const h = (img.naturalHeight / 32) * v.ppu * (o.sy ?? 1);
  const px = (x - v.camX) * v.ppu + v.w / 2;
  const py = v.h / 2 - (y - v.camY) * v.ppu;
  if (
    px + Math.abs(w) < 0 ||
    px - Math.abs(w) > v.w ||
    py + Math.abs(h) < 0 ||
    py - Math.abs(h) > v.h
  )
    return;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (!o.rot && !o.flipX) {
    // snap both edges to whole pixels so neighbouring tiles share an edge (no seams)
    const x0 = Math.round(px - w / 2);
    const y0 = Math.round(py - h / 2);
    ctx.drawImage(drawable, x0, y0, Math.round(px + w / 2) - x0, Math.round(py + h / 2) - y0);
    ctx.restore();
    return;
  }
  ctx.translate(px, py);
  if (o.rot) ctx.rotate((-o.rot * Math.PI) / 180);
  if (o.flipX) ctx.scale(-1, 1);
  ctx.drawImage(drawable, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export const sprite = (
  ctx: CanvasRenderingContext2D,
  v: View,
  name: string | undefined,
  x: number,
  y: number,
  o?: DrawOpts,
) => {
  if (name) drawSrc(ctx, v, tex(name), x, y, o);
};

export function rect(
  ctx: CanvasRenderingContext2D,
  v: View,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  const x0 = Math.round((x - w / 2 - v.camX) * v.ppu + v.w / 2);
  const y0 = Math.round(v.h / 2 - (y + h / 2 - v.camY) * v.ppu);
  const x1 = Math.round((x + w / 2 - v.camX) * v.ppu + v.w / 2);
  const y1 = Math.round(v.h / 2 - (y - h / 2 - v.camY) * v.ppu);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

export function frameOf(anim: FrameAnim, t: number) {
  const i = Math.floor((t - anim.start) * anim.fps);
  if (anim.loop)
    return anim.frames[((i % anim.frames.length) + anim.frames.length) % anim.frames.length];
  return anim.frames[Math.min(anim.frames.length - 1, Math.max(0, i))];
}

/** Visible world rectangle of a view. */
export function viewBounds(v: View) {
  const hw = v.w / 2 / v.ppu;
  const hh = v.h / 2 / v.ppu;
  return { minX: v.camX - hw, maxX: v.camX + hw, minY: v.camY - hh, maxY: v.camY + hh };
}
